import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Package, Plus, Edit2, Eye, EyeOff, CheckCircle2, Clock, XCircle,
  Coins, Star, Gift, Trash2, ChevronDown, ChevronUp, BarChart3, AlertTriangle,
  Zap, RefreshCw, Users, TrendingUp, Flame, Crown, RotateCcw, Settings2, Trophy
} from "lucide-react";

interface RewardCategory { id: number; name: string; icon: string; color: string; sortOrder: number; isActive: boolean; }
interface RewardItem {
  id: number; categoryId: number; name: string; shortDesc: string; fullDesc?: string; image?: string;
  tokenPrice: number; salePriceTokens?: number | null; cashValue?: string | null; status: string;
  featured: boolean; inventory?: number | null; maxPerUser: number; maxPerMonth: number;
  tierRequired: string; deliveryType: string; scheduleRequired: boolean; expirationDays?: number | null;
  promoBadge?: string | null; isLimitedTime: boolean; adminNotes?: string | null;
}
interface AdminItemRow { item: RewardItem; category: RewardCategory | null; }
interface AdminRedemption {
  redemption: { id: number; itemName: string; tokenCost: number; status: string; createdAt: string; userNotes?: string; adminNotes?: string; };
  user: { id: string; name?: string; email: string; } | null;
}
interface ShopStats { activeItems: number; pendingRedemptions: number; totalTokensBurned: number; tokensBurnedThisMonth: number; lowStockItems: number; }

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  hidden: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  draft: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  sold_out: "bg-red-500/20 text-red-400 border-red-500/30",
};
const REDEMPTION_STATUS_BADGE: Record<string, string> = {
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

const REDEMPTION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  pending_approval: "Needs Approval",
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

const BLANK_ITEM: Partial<RewardItem> = {
  categoryId: 0, name: "", shortDesc: "", fullDesc: "", image: "", tokenPrice: 1000,
  cashValue: "", status: "active", featured: false, inventory: undefined, maxPerUser: 10,
  maxPerMonth: 5, tierRequired: "none", deliveryType: "manual", scheduleRequired: false,
  expirationDays: undefined, promoBadge: "", isLimitedTime: false, adminNotes: "",
};

function formatTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
}

export default function AdminRewardShopPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"items" | "categories" | "redemptions" | "spin_wheel">("items");
  const [itemSearch, setItemSearch] = useState("");
  const [editItem, setEditItem] = useState<Partial<RewardItem> | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);
  const [redemptionFilter, setRedemptionFilter] = useState("");
  const [actionRedemption, setActionRedemption] = useState<AdminRedemption | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [newCat, setNewCat] = useState({ name: "", icon: "🎁", color: "#f59e0b" });
  const [showCatForm, setShowCatForm] = useState(false);

  const { data: stats } = useQuery<ShopStats>({ queryKey: ["/api/admin/reward-shop/stats"], enabled: !!user });
  const { data: adminItems, isLoading } = useQuery<AdminItemRow[]>({ queryKey: ["/api/admin/reward-shop/items"], enabled: !!user });
  const { data: categories } = useQuery<RewardCategory[]>({ queryKey: ["/api/admin/reward-shop/categories"], enabled: !!user });
  const { data: redemptions } = useQuery<AdminRedemption[]>({
    queryKey: ["/api/admin/reward-shop/redemptions", redemptionFilter],
    queryFn: () => fetch(`/api/admin/reward-shop/redemptions${redemptionFilter ? `?status=${redemptionFilter}` : ""}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!user && activeTab === "redemptions",
  });
  const { data: spinAdminData, refetch: refetchSpinConfig } = useQuery<{ config: any[]; jackpots: any[] }>({
    queryKey: ["/api/admin/spin-config"],
    enabled: !!user && activeTab === "spin_wheel",
  });
  const spinConfigMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiRequest("PATCH", `/api/admin/spin-config/${key}`, { value }),
    onSuccess: () => { refetchSpinConfig(); toast({ title: "Setting saved" }); },
  });
  const jackpotResetMutation = useMutation({
    mutationFn: (type: string) => apiRequest("POST", `/api/admin/jackpots/${type}/reset`, {}),
    onSuccess: () => { refetchSpinConfig(); toast({ title: "Jackpot reset to starting value" }); },
  });

  const saveItemMutation = useMutation({
    mutationFn: (data: Partial<RewardItem>) => isNewItem
      ? apiRequest("POST", "/api/admin/reward-shop/items", data)
      : apiRequest("PATCH", `/api/admin/reward-shop/items/${(data as any).id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/stats"] });
      setEditItem(null);
      toast({ title: isNewItem ? "Item created!" : "Item updated!", description: "Changes are live in the marketplace." });
    },
    onError: (e: any) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/admin/reward-shop/items/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/stats"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleFeaturedMutation = useMutation({
    mutationFn: ({ id, featured }: { id: number; featured: boolean }) =>
      apiRequest("PATCH", `/api/admin/reward-shop/items/${id}`, { featured }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/items"] }),
  });

  const resetCatalogMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/reward-shop/reset-catalog", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/stats"] });
      toast({ title: "Catalog reset!", description: `Hid ${data.hidden} old items, loaded ${data.inserted} official items.` });
    },
    onError: (e: any) => toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });

  const redemptionActionMutation = useMutation({
    mutationFn: ({ id, status, adminNotes }: { id: number; status: string; adminNotes?: string }) =>
      apiRequest("PATCH", `/api/admin/reward-shop/redemptions/${id}`, { status, adminNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/redemptions", redemptionFilter] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/stats"] });
      setActionRedemption(null);
      setActionStatus("");
      setAdminNote("");
      toast({ title: "Redemption updated!" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const saveCatMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/reward-shop/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/categories"] });
      setShowCatForm(false);
      setNewCat({ name: "", icon: "🎁", color: "#f59e0b" });
      toast({ title: "Category created!" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleCatMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/reward-shop/categories/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/categories"] }),
  });

  const filteredItems = (adminItems ?? []).filter(r =>
    !itemSearch || r.item.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const tabs = [
    { id: "items", label: "Shop Items", count: stats?.activeItems },
    { id: "categories", label: "Categories", count: categories?.length },
    { id: "redemptions", label: "Redemptions", count: stats?.pendingRedemptions, alert: (stats?.pendingRedemptions ?? 0) > 0 },
    { id: "spin_wheel", label: "🎰 Spin Wheel" },
  ] as const;

  if (!user || !["admin", "business_owner"].includes(user.role ?? "")) {
    return <div className="p-8 text-center text-muted-foreground">Admin access required.</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-4 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Gift className="h-5 w-5 text-yellow-500" /> Rewards Marketplace Admin
            </h1>
            <p className="text-xs text-muted-foreground">Manage the JCMOVES rewards catalog</p>
          </div>
          {activeTab === "items" && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs"
                disabled={resetCatalogMutation.isPending}
                onClick={() => {
                  if (confirm("This will hide ALL current reward items and reload the official 12-item catalog. Continue?")) {
                    resetCatalogMutation.mutate();
                  }
                }}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {resetCatalogMutation.isPending ? "Resetting…" : "Reset Catalog"}
              </Button>
              <Button
                size="sm"
                className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                onClick={() => { setIsNewItem(true); setEditItem({ ...BLANK_ITEM }); }}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5">
        {/* Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {[
            { label: "Active Items", value: stats?.activeItems ?? 0, icon: Package, color: "text-green-400" },
            { label: "Pending Redemptions", value: stats?.pendingRedemptions ?? 0, icon: Clock, color: "text-yellow-400" },
            { label: "Tokens Burned (Month)", value: formatTokens(stats?.tokensBurnedThisMonth ?? 0), icon: Coins, color: "text-orange-400" },
            { label: "Total Burned", value: formatTokens(stats?.totalTokensBurned ?? 0), icon: TrendingUp, color: "text-purple-400" },
            { label: "Low Stock Alerts", value: stats?.lowStockItems ?? 0, icon: AlertTriangle, color: "text-red-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <div className={`text-xl font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5 border-b border-border pb-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab.id ? "bg-yellow-500 text-black" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${(tab as any).alert ? "bg-red-500 text-white" : "bg-card border border-border"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Items Tab ── */}
        {activeTab === "items" && (
          <>
            <div className="flex gap-2 mb-4">
              <Input placeholder="Search items…" value={itemSearch} onChange={e => setItemSearch(e.target.value)} className="h-9 text-sm max-w-xs" />
              <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/reward-shop/items"] })}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Item</th>
                    <th className="text-left py-2 pr-4 font-medium">Category</th>
                    <th className="text-right py-2 pr-4 font-medium">Token Price</th>
                    <th className="text-center py-2 pr-4 font-medium">Status</th>
                    <th className="text-center py-2 pr-4 font-medium">Featured</th>
                    <th className="text-right py-2 pr-4 font-medium">Stock</th>
                    <th className="text-right py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    Array(6).fill(0).map((_, i) => (
                      <tr key={i}><td colSpan={7} className="py-3 animate-pulse"><div className="h-6 bg-muted rounded" /></td></tr>
                    ))
                  ) : filteredItems.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No items found</td></tr>
                  ) : (
                    filteredItems.map(({ item, category }) => (
                      <tr key={item.id} className="hover:bg-accent/20 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="font-semibold truncate max-w-[200px]">{item.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{item.shortDesc}</div>
                        </td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground">
                          {category?.icon} {category?.name ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <div className="font-bold text-yellow-500">{formatTokens(item.tokenPrice)}</div>
                          {item.salePriceTokens && <div className="text-xs text-red-400">Sale: {formatTokens(item.salePriceTokens)}</div>}
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <button
                            onClick={() => toggleStatusMutation.mutate({ id: item.id, status: item.status === "active" ? "hidden" : "active" })}
                            className={`text-xs font-bold px-2 py-1 rounded-full border capitalize ${STATUS_BADGE[item.status] ?? STATUS_BADGE.hidden}`}
                          >
                            {item.status}
                          </button>
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <button
                            onClick={() => toggleFeaturedMutation.mutate({ id: item.id, featured: !item.featured })}
                            className={`text-xs p-1 rounded ${item.featured ? "text-yellow-500" : "text-muted-foreground"}`}
                          >
                            <Star className={`h-4 w-4 ${item.featured ? "fill-current" : ""}`} />
                          </button>
                        </td>
                        <td className="py-3 pr-4 text-right text-sm">
                          {item.inventory === null || item.inventory === undefined ? (
                            <span className="text-muted-foreground">∞</span>
                          ) : (
                            <span className={item.inventory < 5 ? "text-red-400 font-bold" : ""}>{item.inventory}</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setIsNewItem(false); setEditItem(item); }}>
                            <Edit2 className="h-3 w-3 mr-1" /> Edit
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Categories Tab ── */}
        {activeTab === "categories" && (
          <>
            <div className="flex justify-end mb-4">
              <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold" onClick={() => setShowCatForm(!showCatForm)}>
                <Plus className="h-4 w-4 mr-1" /> New Category
              </Button>
            </div>
            {showCatForm && (
              <div className="bg-card border border-yellow-500/30 rounded-xl p-4 mb-4 flex gap-3 flex-wrap">
                <Input placeholder="Category name" value={newCat.name} onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))} className="h-9 text-sm flex-1 min-w-[140px]" />
                <Input placeholder="Icon (emoji)" value={newCat.icon} onChange={e => setNewCat(p => ({ ...p, icon: e.target.value }))} className="h-9 text-sm w-24" />
                <Input placeholder="Color" value={newCat.color} onChange={e => setNewCat(p => ({ ...p, color: e.target.value }))} className="h-9 text-sm w-28" type="color" />
                <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold h-9" disabled={!newCat.name || saveCatMutation.isPending} onClick={() => saveCatMutation.mutate(newCat)}>
                  {saveCatMutation.isPending ? <Zap className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {(categories ?? []).map(cat => (
                <div key={cat.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{cat.icon}</span>
                    <div>
                      <div className="font-semibold text-sm">{cat.name}</div>
                      <div className="text-xs text-muted-foreground">Sort order: {cat.sortOrder}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCatMutation.mutate({ id: cat.id, isActive: !cat.isActive })}
                    className={`text-xs font-bold px-3 py-1 rounded-full border transition-colors ${cat.isActive ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}
                  >
                    {cat.isActive ? "Active" : "Hidden"}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Redemptions Tab ── */}
        {activeTab === "redemptions" && (
          <>
            <div className="flex gap-2 mb-4">
              {["", "pending_approval", "redeemed_pending_schedule", "pending", "approved", "scheduled", "completed", "fulfilled", "denied", "cancelled"].map(s => (
                <button
                  key={s}
                  onClick={() => setRedemptionFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize ${redemptionFilter === s ? "bg-yellow-500 text-black border-yellow-500" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {s ? (REDEMPTION_STATUS_LABELS[s] ?? s) : "All"}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {!redemptions || redemptions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No redemptions found</p>
                </div>
              ) : (
                redemptions.map(({ redemption, user: rUser }) => (
                  <div key={redemption.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${REDEMPTION_STATUS_BADGE[redemption.status] ?? REDEMPTION_STATUS_BADGE.pending}`}>
                            {REDEMPTION_STATUS_LABELS[redemption.status] ?? redemption.status}
                          </span>
                          <span className="text-xs text-muted-foreground">#{redemption.id}</span>
                        </div>
                        <div className="font-semibold text-sm">{redemption.itemName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {rUser?.name ?? rUser?.email ?? "Unknown user"} • {redemption.tokenCost.toLocaleString()} JCMOVES • {new Date(redemption.createdAt).toLocaleDateString()}
                        </div>
                        {redemption.userNotes && (
                          <div className="text-xs text-muted-foreground italic mt-1 bg-accent/30 rounded px-2 py-1">"{redemption.userNotes}"</div>
                        )}
                        {redemption.adminNotes && (
                          <div className="text-xs text-blue-400 mt-1">Admin: {redemption.adminNotes}</div>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                        {/* Needs Approval → Approve or Deny */}
                        {redemption.status === "pending_approval" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-green-400 border-green-500/30 hover:bg-green-500/10"
                              onClick={() => { setActionRedemption({ redemption, user: rUser }); setActionStatus("approved"); }}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                              onClick={() => { setActionRedemption({ redemption, user: rUser }); setActionStatus("denied"); }}>
                              <XCircle className="h-3 w-3 mr-1" /> Deny
                            </Button>
                          </>
                        )}
                        {/* Schedule Needed → Mark Scheduled or Fulfilled */}
                        {redemption.status === "redeemed_pending_schedule" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
                              onClick={() => { setActionRedemption({ redemption, user: rUser }); setActionStatus("scheduled"); }}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Scheduled
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-green-400 border-green-500/30 hover:bg-green-500/10"
                              onClick={() => { setActionRedemption({ redemption, user: rUser }); setActionStatus("fulfilled"); }}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Fulfill
                            </Button>
                          </>
                        )}
                        {/* Pending → Fulfill or Cancel */}
                        {redemption.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-green-400 border-green-500/30 hover:bg-green-500/10"
                              onClick={() => { setActionRedemption({ redemption, user: rUser }); setActionStatus("completed"); }}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Fulfill
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                              onClick={() => { setActionRedemption({ redemption, user: rUser }); setActionStatus("cancelled"); }}>
                              <XCircle className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          </>
                        )}
                        {/* Approved → Complete or Cancel */}
                        {redemption.status === "approved" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-green-400 border-green-500/30"
                              onClick={() => { setActionRedemption({ redemption, user: rUser }); setActionStatus("completed"); }}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-500/30"
                              onClick={() => { setActionRedemption({ redemption, user: rUser }); setActionStatus("cancelled"); }}>
                              <XCircle className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                          </>
                        )}
                        {/* Scheduled → Fulfill */}
                        {redemption.status === "scheduled" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs text-green-400 border-green-500/30"
                            onClick={() => { setActionRedemption({ redemption, user: rUser }); setActionStatus("fulfilled"); }}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Fulfilled
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ── Spin Wheel Tab ── */}
        {activeTab === "spin_wheel" && (
          <div className="space-y-6">
            {/* Jackpot meters */}
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-400" /> Progressive Jackpots
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {(spinAdminData?.jackpots ?? []).map((jp: any) => (
                  <div key={jp.type} className={`border rounded-xl p-4 ${jp.type === "major" ? "border-yellow-500/30 bg-yellow-950/20" : "border-orange-500/30 bg-orange-950/20"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        {jp.type === "major" ? <Crown className="h-4 w-4 text-yellow-400" /> : <Flame className="h-4 w-4 text-orange-400" />}
                        <span className="text-xs font-bold uppercase tracking-wide">{jp.type} Jackpot</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() => jackpotResetMutation.mutate(jp.type)}
                        disabled={jackpotResetMutation.isPending}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Reset
                      </Button>
                    </div>
                    <div className={`text-2xl font-black ${jp.type === "major" ? "text-yellow-400" : "text-orange-400"}`}>
                      {parseInt(jp.current_value).toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground ml-1">JCMOVES</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Starting: {parseInt(jp.starting_value).toLocaleString()} • +{jp.contribution_per_spin}/spin • {parseFloat(jp.win_probability_pct).toFixed(4)}% win chance</div>
                    {jp.last_winner_name && (
                      <div className="text-xs text-purple-400 mt-1">Last won: <strong>{jp.last_winner_name}</strong> — {parseInt(jp.last_won_amount).toLocaleString()} JCMOVES {jp.last_won_at ? `(${new Date(jp.last_won_at).toLocaleDateString()})` : ""}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Spin config settings */}
            <div>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-blue-400" /> Spin Settings
              </h3>
              <div className="space-y-3">
                {(spinAdminData?.config ?? []).map((cfg: any) => (
                  <div key={cfg.setting_key} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold">{cfg.setting_key}</div>
                      <div className="text-xs text-muted-foreground">{cfg.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {cfg.setting_key === "spin_wheel_enabled" ? (
                        <Switch
                          checked={cfg.setting_value === "true"}
                          onCheckedChange={v => spinConfigMutation.mutate({ key: cfg.setting_key, value: v ? "true" : "false" })}
                        />
                      ) : (
                        <Input
                          defaultValue={cfg.setting_value}
                          className="h-8 w-24 text-sm text-right"
                          onBlur={e => {
                            if (e.target.value !== cfg.setting_value) {
                              spinConfigMutation.mutate({ key: cfg.setting_key, value: e.target.value });
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quantum Spin Prize Table */}
            <div>
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-400" /> Quantum Spin Prize Table
              </h3>
              <p className="text-xs text-muted-foreground mb-3">12-prize table · total probability = 100%</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4 font-medium">Idx</th>
                      <th className="text-left py-2 pr-4 font-medium">Prize</th>
                      <th className="text-left py-2 pr-4 font-medium">Type</th>
                      <th className="text-right py-2 font-medium">Probability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {[
                      { label: "25 JCMOVES",     type: "tokens",           prob: "20%", note: "" },
                      { label: "75 JCMOVES",     type: "tokens",           prob: "20%", note: "" },
                      { label: "100 JCMOVES",    type: "tokens",           prob: "18%", note: "" },
                      { label: "125 JCMOVES",    type: "tokens",           prob: "15%", note: "" },
                      { label: "150 JCMOVES",    type: "tokens",           prob: "10%", note: "" },
                      { label: "250 JCMOVES",    type: "tokens",           prob: "5%",  note: "" },
                      { label: "500 JCMOVES",    type: "tokens",           prob: "3%",  note: "" },
                      { label: "2,000 JCMOVES",  type: "tokens",           prob: "1%",  note: "" },
                      { label: "🎁 Mystery Box", type: "mystery",          prob: "1%",  note: "See mystery pool below" },
                      { label: "☕ $5 Coffee",   type: "gift_card_coffee", prob: "2%",  note: "Promo code · 90 day expiry" },
                      { label: "10% Off",        type: "coupon_10pct",     prob: "4%",  note: "Promo code · 90 day expiry" },
                      { label: "25% Off",        type: "coupon_25pct",     prob: "1%",  note: "Promo code · 30 day expiry" },
                    ].map((p, i) => (
                      <tr key={i} className={p.type === "mystery" ? "bg-purple-950/20" : ""}>
                        <td className="py-1.5 pr-4 text-muted-foreground">{i}</td>
                        <td className="py-1.5 pr-4 font-medium">{p.label}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{p.type}</td>
                        <td className="py-1.5 text-right font-bold">
                          <span className="flex items-center justify-end gap-2">
                            {p.prob}
                            {p.note && <span className="text-[10px] text-muted-foreground/60 font-normal hidden sm:inline">{p.note}</span>}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mystery Box Pool */}
            <div>
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                <Gift className="h-4 w-4 text-purple-400" /> Mystery Box Secondary Pool
              </h3>
              <p className="text-xs text-muted-foreground mb-3">Resolved server-side when Mystery Box is drawn</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4 font-medium">Reward</th>
                      <th className="text-left py-2 pr-4 font-medium">Type</th>
                      <th className="text-right py-2 font-medium">Weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {[
                      { label: "300 JCMOVES",   type: "tokens",           weight: "35%" },
                      { label: "500 JCMOVES",   type: "tokens",           weight: "25%" },
                      { label: "1,000 JCMOVES", type: "tokens",           weight: "15%" },
                      { label: "2,000 JCMOVES", type: "tokens",           weight: "10%" },
                      { label: "☕ $5 Coffee",  type: "gift_card_coffee", weight: "5%"  },
                      { label: "10% Off",       type: "coupon_10pct",     weight: "5%"  },
                      { label: "🎰 Free Spin",  type: "free_spin",        weight: "5%"  },
                    ].map((p, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-4 font-medium">{p.label}</td>
                        <td className="py-1.5 pr-4 text-muted-foreground">{p.type}</td>
                        <td className="py-1.5 text-right font-bold">{p.weight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Free spin entitlements expire in 30 days. Coupons use coupon_expiry_days from Spin Settings.</p>
            </div>

            {/* Recent Jackpot Wins */}
            {(spinAdminData?.recentJackpotWins ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-400" /> Recent Jackpot Wins
                </h3>
                <div className="space-y-2">
                  {(spinAdminData.recentJackpotWins as any[]).map((win: any) => (
                    <div key={win.id} className="flex items-center justify-between bg-yellow-950/20 border border-yellow-500/20 rounded-lg px-3 py-2 text-xs">
                      <div>
                        <span className="font-bold text-yellow-400">{win.username || win.first_name || "User"}</span>
                        <span className="text-muted-foreground ml-2">won {parseInt(win.amount).toLocaleString()} JCMOVES</span>
                        <Badge className={`ml-2 text-[10px] py-0 ${win.jackpot_type === "major" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : "bg-orange-500/20 text-orange-400 border-orange-500/30"}`}>
                          {win.jackpot_type}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground">{new Date(win.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Edit/Create Item Dialog ── */}
      <Dialog open={!!editItem} onOpenChange={open => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNewItem ? "Create Reward Item" : "Edit Reward Item"}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4 py-2">
              {/* Basic info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Item Name *</Label>
                  <Input value={editItem.name ?? ""} onChange={e => setEditItem(p => ({ ...p!, name: e.target.value }))} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Category *</Label>
                  <Select value={String(editItem.categoryId ?? 0)} onValueChange={v => setEditItem(p => ({ ...p!, categoryId: parseInt(v) }))}>
                    <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {(categories ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">Short Description *</Label>
                <Input value={editItem.shortDesc ?? ""} onChange={e => setEditItem(p => ({ ...p!, shortDesc: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="One-line description shown on card" />
              </div>
              <div>
                <Label className="text-xs font-semibold">Full Description</Label>
                <Textarea value={editItem.fullDesc ?? ""} onChange={e => setEditItem(p => ({ ...p!, fullDesc: e.target.value }))} className="mt-1 text-sm resize-none" rows={3} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Image URL</Label>
                <Input value={editItem.image ?? ""} onChange={e => setEditItem(p => ({ ...p!, image: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="https://…" />
              </div>

              {/* Pricing */}
              <div className="border-t border-border pt-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Pricing</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Token Price *</Label>
                    <Input type="number" value={editItem.tokenPrice ?? 0} onChange={e => setEditItem(p => ({ ...p!, tokenPrice: parseInt(e.target.value) || 0 }))} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Sale Price (optional)</Label>
                    <Input type="number" value={editItem.salePriceTokens ?? ""} onChange={e => setEditItem(p => ({ ...p!, salePriceTokens: e.target.value ? parseInt(e.target.value) : null }))} className="mt-1 h-9 text-sm" placeholder="Leave blank" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Cash Value (USD)</Label>
                    <Input value={editItem.cashValue ?? ""} onChange={e => setEditItem(p => ({ ...p!, cashValue: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="e.g. 25.00" />
                  </div>
                </div>
                <div className="mt-2">
                  <Label className="text-xs font-semibold">Promo Badge Text</Label>
                  <Input value={editItem.promoBadge ?? ""} onChange={e => setEditItem(p => ({ ...p!, promoBadge: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="e.g. Best Value, Hot Deal" />
                </div>
              </div>

              {/* Inventory & Visibility */}
              <div className="border-t border-border pt-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Availability</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Status</Label>
                    <Select value={editItem.status ?? "active"} onValueChange={v => setEditItem(p => ({ ...p!, status: v }))}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="hidden">Hidden</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="sold_out">Sold Out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Inventory (blank = ∞)</Label>
                    <Input type="number" value={editItem.inventory ?? ""} onChange={e => setEditItem(p => ({ ...p!, inventory: e.target.value ? parseInt(e.target.value) : undefined }))} className="mt-1 h-9 text-sm" placeholder="Unlimited" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Max / User</Label>
                    <Input type="number" value={editItem.maxPerUser ?? 10} onChange={e => setEditItem(p => ({ ...p!, maxPerUser: parseInt(e.target.value) || 10 }))} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Max / Month</Label>
                    <Input type="number" value={editItem.maxPerMonth ?? 5} onChange={e => setEditItem(p => ({ ...p!, maxPerMonth: parseInt(e.target.value) || 5 }))} className="mt-1 h-9 text-sm" />
                  </div>
                </div>
                <div className="flex gap-6 mt-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={!!editItem.featured} onCheckedChange={v => setEditItem(p => ({ ...p!, featured: v }))} />
                    <Label className="text-xs">Featured</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={!!editItem.isLimitedTime} onCheckedChange={v => setEditItem(p => ({ ...p!, isLimitedTime: v }))} />
                    <Label className="text-xs">Limited Time</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={!!editItem.scheduleRequired} onCheckedChange={v => setEditItem(p => ({ ...p!, scheduleRequired: v }))} />
                    <Label className="text-xs">Schedule Required</Label>
                  </div>
                </div>
              </div>

              {/* Redemption rules */}
              <div className="border-t border-border pt-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Redemption Rules</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Tier Required</Label>
                    <Select value={editItem.tierRequired ?? "none"} onValueChange={v => setEditItem(p => ({ ...p!, tierRequired: v }))}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="bronze">Bronze</SelectItem>
                        <SelectItem value="silver">Silver</SelectItem>
                        <SelectItem value="gold">Gold</SelectItem>
                        <SelectItem value="vip">VIP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Delivery Type</Label>
                    <Select value={editItem.deliveryType ?? "manual"} onValueChange={v => setEditItem(p => ({ ...p!, deliveryType: v }))}>
                      <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="digital_code">Digital Code</SelectItem>
                        <SelectItem value="service_credit">Service Credit</SelectItem>
                        <SelectItem value="schedule_required">Schedule Required</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Expires After (days)</Label>
                    <Input type="number" value={editItem.expirationDays ?? ""} onChange={e => setEditItem(p => ({ ...p!, expirationDays: e.target.value ? parseInt(e.target.value) : undefined }))} className="mt-1 h-9 text-sm" placeholder="No expiry" />
                  </div>
                </div>
              </div>

              {/* Admin notes */}
              <div className="border-t border-border pt-4">
                <Label className="text-xs font-semibold">Admin Notes (internal)</Label>
                <Textarea value={editItem.adminNotes ?? ""} onChange={e => setEditItem(p => ({ ...p!, adminNotes: e.target.value }))} className="mt-1 text-sm resize-none" rows={2} placeholder="Fulfillment instructions, internal notes…" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              disabled={saveItemMutation.isPending || !editItem?.name || !editItem?.categoryId}
              onClick={() => saveItemMutation.mutate(editItem!)}
            >
              {saveItemMutation.isPending ? <><Zap className="h-4 w-4 animate-spin mr-2" />Saving…</> : isNewItem ? "Create Item" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Redemption action dialog ── */}
      <Dialog open={!!actionRedemption} onOpenChange={open => !open && setActionRedemption(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className={actionStatus === "completed" ? "text-green-400" : "text-red-400"}>
              {actionStatus === "completed" ? "Mark as Fulfilled" : "Cancel Redemption"}
            </DialogTitle>
          </DialogHeader>
          {actionRedemption && (
            <div className="space-y-3 py-2">
              <div className="bg-card border border-border rounded-lg p-3 text-sm">
                <div className="font-semibold">{actionRedemption.redemption.itemName}</div>
                <div className="text-muted-foreground text-xs">{actionRedemption.user?.name ?? actionRedemption.user?.email} • {actionRedemption.redemption.tokenCost.toLocaleString()} JCMOVES</div>
              </div>
              {actionStatus === "cancelled" && (
                <div className="text-xs text-muted-foreground bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                  Cancelling will refund {actionRedemption.redemption.tokenCost.toLocaleString()} JCMOVES to the user.
                </div>
              )}
              <div>
                <Label className="text-xs font-semibold">Admin Note (sent to user)</Label>
                <Textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} className="mt-1 text-sm resize-none" rows={2} placeholder="Optional note for the user…" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setActionRedemption(null)}>Back</Button>
            <Button
              className={actionStatus === "completed" ? "bg-green-500 hover:bg-green-600 text-white font-bold" : "bg-red-500 hover:bg-red-600 text-white font-bold"}
              disabled={redemptionActionMutation.isPending}
              onClick={() => redemptionActionMutation.mutate({ id: actionRedemption!.redemption.id, status: actionStatus, adminNotes: adminNote || undefined })}
            >
              {redemptionActionMutation.isPending ? <Zap className="h-4 w-4 animate-spin" /> : actionStatus === "completed" ? "Confirm Fulfilled" : "Confirm Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
