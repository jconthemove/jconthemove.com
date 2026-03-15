import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Ticket, Trophy, Clock, Coins, Flame, Crown, X, History,
  TrendingUp, Zap, Star, Users, ChevronRight, BarChart3, RefreshCw
} from "lucide-react";

interface LotteryRound {
  id: number;
  round_number: number;
  round_type: string;
  status: string;
  start_time: string;
  end_time: string;
  seed_amount: number;
  tickets_sold: number;
  total_entries: number;
  winner_pool: number;
  burn_pool: number;
  treasury_pool: number;
  displayed_jackpot: number;
  my_tickets: number;
  recent_purchases: { ticket_count: number; cost_jcmoves: number; created_at: string; first_name: string; username: string }[];
}

interface LotteryWinner {
  id: number;
  round_number: number;
  round_type: string;
  user_id: string;
  first_name: string;
  username: string;
  payout_amount: number;
  win_streak: number;
  created_at: string;
}

interface LotteryPanelProps {
  open: boolean;
  onClose: () => void;
}

const TICKET_PACKS = [1, 5, 15, 25, 50, 75, 100, 200, 500, 1000];
const TICKET_PRICE = 10;

function useCountdown(endTime: string | undefined) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!endTime) return;
    const tick = () => setSecs(Math.max(0, Math.floor((new Date(endTime).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return { d, h, m, s, total: secs };
}

function CountdownBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-black/40 border border-yellow-500/30 rounded-lg px-2.5 py-1.5 min-w-[44px] text-center">
        <span className="text-xl font-black text-yellow-400 tabular-nums">{String(value).padStart(2, "0")}</span>
      </div>
      <span className="text-[9px] text-yellow-600 font-bold uppercase tracking-widest mt-0.5">{label}</span>
    </div>
  );
}

function formatTokens(n: number) {
  return n.toLocaleString();
}

function timeAgo(dateStr: string) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function LotteryPanel({ open, onClose }: LotteryPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("buy");
  const [roundType, setRoundType] = useState<"weekly" | "monthly">("weekly");
  const [selectedPack, setSelectedPack] = useState<number | null>(null);

  const { data: rounds = [], isLoading: roundsLoading } = useQuery<LotteryRound[]>({
    queryKey: ["/api/lottery/status"],
    enabled: open,
    refetchInterval: open ? 15000 : false,
  });

  const { data: history = [] } = useQuery<LotteryWinner[]>({
    queryKey: ["/api/lottery/history"],
    enabled: open && activeTab === "winners",
  });

  const { data: myData } = useQuery<{ entries: any[]; purchases: any[]; wins: any[] }>({
    queryKey: ["/api/lottery/my-entries"],
    enabled: open && activeTab === "mine",
  });

  const { data: walletData } = useQuery<{ tokenBalance: string }>({
    queryKey: ["/api/rewards/wallet"],
    enabled: open,
    refetchInterval: open ? 10000 : false,
  });

  const walletBalance = parseFloat(walletData?.tokenBalance || "0");
  const round = rounds.find(r => r.round_type === roundType);
  const countdown = useCountdown(round?.end_time);
  const jackpot = round?.displayed_jackpot ?? (roundType === "monthly" ? 10000 : 1000);

  const buyMutation = useMutation({
    mutationFn: async (ticket_count: number) => {
      const res = await apiRequest("POST", "/api/lottery/buy", { ticket_count, round_type: roundType });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/lottery/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lottery/my-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      toast({
        title: "🎟️ Tickets purchased!",
        description: `${selectedPack} ticket${selectedPack !== 1 ? "s" : ""} added to the ${roundType === "monthly" ? "Mega " : ""}Lottery. Good luck!`,
      });
      setSelectedPack(null);
    },
    onError: (e: any) => {
      toast({ title: "Purchase failed", description: e.message, variant: "destructive" });
    },
  });

  const handleBuy = useCallback(() => {
    if (!selectedPack) return;
    const cost = selectedPack * TICKET_PRICE;
    if (walletBalance < cost) {
      toast({ title: "Insufficient balance", description: `You need ${cost.toLocaleString()} JCMOVES for ${selectedPack} ticket${selectedPack !== 1 ? "s" : ""}`, variant: "destructive" });
      return;
    }
    buyMutation.mutate(selectedPack);
  }, [selectedPack, walletBalance, buyMutation, toast]);

  const oddsDisplay = round && round.total_entries > 0 && round.my_tickets > 0
    ? `${((round.my_tickets / (round.total_entries + (selectedPack || 0))) * 100).toFixed(2)}%`
    : "—";

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-gray-950 border border-yellow-500/20 max-h-[95vh] overflow-y-auto">

        {/* ── Header ── */}
        <div className="relative bg-gradient-to-br from-gray-900 via-gray-950 to-black px-5 pt-5 pb-4 border-b border-yellow-500/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <Ticket className="h-5 w-5 text-yellow-400" />
                <h2 className="font-black text-base text-white tracking-tight">JCMOVES Lottery</h2>
              </div>
              <p className="text-[11px] text-yellow-400/70 mt-0.5 italic">Weekly & Monthly Mega draws. One ticket, one chance.</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Weekly / Monthly toggle */}
          <div className="flex gap-1.5 mb-3">
            {(["weekly", "monthly"] as const).map(t => (
              <button
                key={t}
                onClick={() => setRoundType(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${roundType === t
                  ? t === "monthly"
                    ? "bg-purple-600 text-white"
                    : "bg-yellow-600 text-black"
                  : "bg-white/5 text-slate-400 hover:text-white"}`}
              >
                {t === "monthly" ? "🌙 Monthly Mega" : "⚡ Weekly"}
              </button>
            ))}
          </div>

          {/* Jackpot display */}
          <div className={`rounded-2xl p-4 text-center border mb-3 ${roundType === "monthly"
            ? "bg-gradient-to-br from-purple-950/60 to-indigo-950/40 border-purple-500/30"
            : "bg-gradient-to-br from-yellow-950/60 to-amber-950/40 border-yellow-500/30"}`}>
            <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${roundType === "monthly" ? "text-purple-300" : "text-yellow-300"}`}>
              {roundType === "monthly" ? "🌙 Mega Jackpot" : "⚡ Weekly Jackpot"}
              {round && <span className="ml-2 opacity-60">Round #{round.round_number}</span>}
            </div>
            <div className={`text-4xl font-black tabular-nums ${roundType === "monthly" ? "text-purple-300" : "text-yellow-400"}`}>
              {formatTokens(jackpot)}
            </div>
            <div className={`text-xs font-bold uppercase tracking-wider mt-0.5 ${roundType === "monthly" ? "text-purple-600" : "text-yellow-700"}`}>
              JCMOVES
            </div>
            {round && (
              <div className="text-[10px] text-slate-500 mt-1">
                {formatTokens(round.tickets_sold)} ticket{round.tickets_sold !== 1 ? "s" : ""} sold · {formatTokens(round.total_entries)} entries
              </div>
            )}
          </div>

          {/* Countdown */}
          {round && (
            <div className="flex items-center justify-center gap-1">
              <Clock className="h-3.5 w-3.5 text-yellow-600 mr-1" />
              <CountdownBlock value={countdown.d} label="days" />
              <span className="text-yellow-700 font-black text-lg">:</span>
              <CountdownBlock value={countdown.h} label="hrs" />
              <span className="text-yellow-700 font-black text-lg">:</span>
              <CountdownBlock value={countdown.m} label="min" />
              <span className="text-yellow-700 font-black text-lg">:</span>
              <CountdownBlock value={countdown.s} label="sec" />
            </div>
          )}

          {/* My tickets row */}
          {round && round.my_tickets > 0 && (
            <div className="mt-3 flex items-center justify-between bg-green-950/40 border border-green-500/20 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-green-400" />
                <span className="text-xs font-bold text-green-300">Your tickets this round</span>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-green-400 tabular-nums">{round.my_tickets}</div>
                <div className="text-[10px] text-green-700">odds ≈ {oddsDisplay}</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Inner tabs ── */}
        <div className="px-5 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-4 bg-gray-900/60 border border-white/5 mb-4 h-8">
              {[
                { v: "buy", icon: <Ticket className="h-3 w-3" />, label: "Buy" },
                { v: "mine", icon: <Star className="h-3 w-3" />, label: "Mine" },
                { v: "winners", icon: <Trophy className="h-3 w-3" />, label: "Winners" },
                { v: "stats", icon: <BarChart3 className="h-3 w-3" />, label: "Stats" },
              ].map(({ v, icon, label }) => (
                <TabsTrigger key={v} value={v} className="text-[10px] font-bold data-[state=active]:bg-yellow-600/20 data-[state=active]:text-yellow-300 flex items-center gap-1 px-1">
                  {icon}{label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── BUY TAB ── */}
            <TabsContent value="buy" className="space-y-4">
              {/* Balance row */}
              <div className={`rounded-xl px-4 py-2.5 flex items-center justify-between ${walletBalance >= TICKET_PRICE ? "bg-green-950/40 border border-green-500/20" : "bg-red-950/40 border border-red-500/20"}`}>
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-yellow-400" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Your Balance</span>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-black tabular-nums ${walletBalance >= TICKET_PRICE ? "text-green-400" : "text-red-400"}`}>
                    {formatTokens(Math.floor(walletBalance))}
                  </div>
                  <div className="text-[10px] text-muted-foreground">JCMOVES · {Math.floor(walletBalance / TICKET_PRICE)} max tickets</div>
                </div>
              </div>

              {/* Pack grid */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Select Ticket Pack — 10 JCMOVES each</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {TICKET_PACKS.map(pack => {
                    const cost = pack * TICKET_PRICE;
                    const canAfford = walletBalance >= cost;
                    const isSelected = selectedPack === pack;
                    return (
                      <button
                        key={pack}
                        onClick={() => setSelectedPack(isSelected ? null : pack)}
                        disabled={!canAfford}
                        className={`rounded-xl py-2.5 px-1 text-center transition-all border ${isSelected
                          ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-300"
                          : canAfford
                            ? "bg-white/5 border-white/10 text-white hover:border-yellow-500/40 hover:bg-yellow-950/30"
                            : "bg-white/[0.02] border-white/5 text-slate-600 cursor-not-allowed"}`}
                      >
                        <div className="text-sm font-black">{pack}</div>
                        <div className={`text-[9px] font-medium ${isSelected ? "text-yellow-500" : "text-muted-foreground"}`}>
                          {cost >= 1000 ? `${cost / 1000}K` : cost}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Buy preview */}
              {selectedPack && (
                <div className="bg-yellow-950/30 border border-yellow-500/30 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Tickets</span>
                    <span className="font-bold text-white">{selectedPack}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Cost</span>
                    <span className="font-bold text-orange-400">{formatTokens(selectedPack * TICKET_PRICE)} JCMOVES</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Est. odds after purchase</span>
                    <span className="font-bold text-green-400">
                      {round && round.total_entries > 0
                        ? `${(((round.my_tickets + selectedPack) / (round.total_entries + selectedPack)) * 100).toFixed(2)}%`
                        : `${((selectedPack / (1 + selectedPack)) * 100).toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Jackpot to win</span>
                    <span className="font-bold text-yellow-400">{formatTokens(jackpot)} JCMOVES</span>
                  </div>
                </div>
              )}

              <Button
                className={`w-full h-14 text-base font-black tracking-wide ${roundType === "monthly"
                  ? "bg-gradient-to-r from-purple-600 via-indigo-500 to-purple-600 hover:from-purple-700 hover:to-purple-700 text-white"
                  : "bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 hover:from-yellow-600 hover:to-yellow-600 text-black"} disabled:opacity-50`}
                onClick={handleBuy}
                disabled={!selectedPack || buyMutation.isPending || walletBalance < (selectedPack || 0) * TICKET_PRICE}
              >
                {buyMutation.isPending ? (
                  <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Ticket className="h-5 w-5 mr-2" />
                )}
                {selectedPack
                  ? `Buy ${selectedPack} Ticket${selectedPack !== 1 ? "s" : ""} — ${formatTokens(selectedPack * TICKET_PRICE)} JCMOVES`
                  : "Select a pack above"}
              </Button>

              {/* Price breakdown info */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 space-y-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">How ticket proceeds are split</p>
                {[
                  { label: "🏆 Winner pool", pct: "70%", color: "text-yellow-400" },
                  { label: "🔥 Burned", pct: "5%", color: "text-red-400" },
                  { label: "🏦 Treasury reserve", pct: "25%", color: "text-blue-400" },
                ].map(({ label, pct, color }) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-slate-400">{label}</span>
                    <span className={`font-bold ${color}`}>{pct}</span>
                  </div>
                ))}
              </div>

              {/* Recent activity */}
              {round?.recent_purchases && round.recent_purchases.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Flame className="h-3 w-3 text-orange-400" /> Recent Purchases
                  </p>
                  <div className="space-y-1">
                    {round.recent_purchases.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex justify-between items-center text-xs bg-white/[0.02] rounded-lg px-3 py-1.5">
                        <span className="text-slate-400">{p.first_name || p.username || "Someone"}</span>
                        <span className="text-yellow-400 font-bold">+{p.ticket_count} ticket{p.ticket_count !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── MY ENTRIES TAB ── */}
            <TabsContent value="mine" className="space-y-4">
              {!myData ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-yellow-400" />
                </div>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Active Tickets", val: round?.my_tickets ?? 0, color: "text-yellow-400", icon: <Ticket className="h-4 w-4" /> },
                      { label: "Total Wins", val: myData.wins.length, color: "text-green-400", icon: <Trophy className="h-4 w-4" /> },
                      { label: "Purchases", val: myData.purchases.length, color: "text-blue-400", icon: <History className="h-4 w-4" /> },
                    ].map(({ label, val, color, icon }) => (
                      <div key={label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 text-center">
                        <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
                        <div className={`text-2xl font-black ${color}`}>{val}</div>
                        <div className="text-[9px] text-muted-foreground font-medium">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Win history */}
                  {myData.wins.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Crown className="h-3 w-3 text-yellow-400" /> Your Wins
                      </p>
                      <div className="space-y-2">
                        {myData.wins.map((w: any, i: number) => (
                          <div key={i} className="bg-yellow-950/30 border border-yellow-500/20 rounded-xl px-4 py-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="text-sm font-black text-yellow-400">{formatTokens(w.payout_amount)} JCMOVES</div>
                                <div className="text-[10px] text-muted-foreground">
                                  Round #{w.round_number} · {w.round_type === "monthly" ? "Mega" : "Weekly"}
                                  {w.win_streak > 1 && <span className="ml-1 text-orange-400">🔥 {w.win_streak}-streak</span>}
                                </div>
                              </div>
                              <div className="text-[10px] text-muted-foreground">{timeAgo(w.created_at)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Purchase history */}
                  {myData.purchases.length > 0 ? (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Purchase History</p>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {myData.purchases.map((p: any, i: number) => (
                          <div key={i} className="flex justify-between items-center text-xs bg-white/[0.02] rounded-lg px-3 py-2">
                            <div>
                              <span className="text-white font-bold">{p.ticket_count} ticket{p.ticket_count !== 1 ? "s" : ""}</span>
                              <span className="text-muted-foreground ml-1.5">· {p.round_type} #{p.round_number}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-orange-400 font-bold">{formatTokens(p.cost_jcmoves)}</div>
                              <div className="text-[9px] text-muted-foreground">{timeAgo(p.created_at)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <Ticket className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-bold">No tickets yet</p>
                      <p className="text-xs mt-1">Buy your first ticket and get in the draw!</p>
                      <Button
                        size="sm"
                        className="mt-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold"
                        onClick={() => setActiveTab("buy")}
                      >
                        Buy Tickets
                      </Button>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* ── WINNERS TAB ── */}
            <TabsContent value="winners" className="space-y-3">
              {history.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-bold">No winners yet</p>
                  <p className="text-xs mt-1">First draw happens Monday at 9:00 AM</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((w, i) => (
                    <div
                      key={w.id}
                      className={`rounded-xl px-4 py-3 border flex items-center justify-between ${w.round_type === "monthly"
                        ? "bg-purple-950/30 border-purple-500/20"
                        : "bg-yellow-950/20 border-yellow-500/15"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center font-black text-sm ${i === 0 ? "bg-yellow-500 text-black" : "bg-white/10 text-slate-300"}`}>
                          {i === 0 ? <Crown className="h-4 w-4" /> : `#${i + 1}`}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">
                            {w.first_name || w.username || "Anonymous"}
                            {w.win_streak > 1 && (
                              <span className="ml-1.5 text-[10px] text-orange-400 font-black">🔥 ×{w.win_streak}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {w.round_type === "monthly" ? "🌙 Mega" : "⚡ Weekly"} Round #{w.round_number} · {timeAgo(w.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-base font-black ${w.round_type === "monthly" ? "text-purple-400" : "text-yellow-400"}`}>
                          {formatTokens(w.payout_amount)}
                        </div>
                        <div className="text-[9px] text-muted-foreground">JCMOVES</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── STATS TAB ── */}
            <TabsContent value="stats" className="space-y-3">
              {rounds.map(r => (
                <div key={r.id} className={`rounded-xl p-4 border space-y-3 ${r.round_type === "monthly"
                  ? "bg-purple-950/20 border-purple-500/20"
                  : "bg-yellow-950/20 border-yellow-500/15"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black uppercase tracking-wider ${r.round_type === "monthly" ? "text-purple-300" : "text-yellow-300"}`}>
                      {r.round_type === "monthly" ? "🌙 Mega Lottery" : "⚡ Weekly Lottery"}
                    </span>
                    <Badge className={`text-[9px] ${r.round_type === "monthly" ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"}`}>
                      Round #{r.round_number}
                    </Badge>
                  </div>
                  {[
                    { label: "Jackpot", val: `${formatTokens(r.displayed_jackpot)} JCMOVES`, color: "text-yellow-400" },
                    { label: "Tickets sold", val: r.tickets_sold.toLocaleString(), color: "text-white" },
                    { label: "Total entries", val: r.total_entries.toLocaleString(), color: "text-white" },
                    { label: "Winner pool (70%)", val: `${formatTokens(r.winner_pool)} JCMOVES`, color: "text-green-400" },
                    { label: "Burned (5%)", val: `${formatTokens(r.burn_pool)} JCMOVES`, color: "text-red-400" },
                    { label: "Treasury (25%)", val: `${formatTokens(r.treasury_pool)} JCMOVES`, color: "text-blue-400" },
                    { label: "Seed", val: `${formatTokens(r.seed_amount)} JCMOVES`, color: "text-slate-300" },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-slate-500">{label}</span>
                      <span className={`font-bold ${color}`}>{val}</span>
                    </div>
                  ))}
                </div>
              ))}

              {rounds.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Loading round stats…</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
