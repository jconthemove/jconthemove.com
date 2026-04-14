import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Ticket, Trophy, Clock, Crown, X, History,
  Star, BarChart3, RefreshCw, Gift, Briefcase, CheckCircle2,
  Users, Zap, TrendingUp
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

// How tickets are earned
const EARN_RULES = [
  { icon: <Briefcase className="h-4 w-4 text-blue-400" />, label: "Book a Job", tickets: 1, desc: "Submit any service request" },
  { icon: <CheckCircle2 className="h-4 w-4 text-green-400" />, label: "Job Completed", tickets: 3, desc: "Your job is marked complete" },
  { icon: <Users className="h-4 w-4 text-orange-400" />, label: "Crew Completes Job", tickets: 3, desc: "Crew members earn per job done" },
  { icon: <TrendingUp className="h-4 w-4 text-purple-400" />, label: "Tier Upgrade", tickets: 5, desc: "Reach Silver, Gold, or Platinum" },
  { icon: <Gift className="h-4 w-4 text-yellow-400" />, label: "Milestone Bonus", tickets: "2–10", desc: "Special events & referral bonuses" },
  { icon: <Zap className="h-4 w-4 text-teal-400" />, label: "Admin Award", tickets: "varies", desc: "Darrell can grant bonus tickets" },
];

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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("earn");
  const [roundType, setRoundType] = useState<"weekly" | "monthly">("weekly");

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

  const round = rounds.find(r => r.round_type === roundType);
  const countdown = useCountdown(round?.end_time);
  const jackpot = round?.displayed_jackpot ?? (roundType === "monthly" ? 10000 : 1000);

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
              <p className="text-[11px] text-yellow-400/70 mt-0.5 italic">Earn tickets through work. Win big.</p>
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
                {formatTokens(round.total_entries)} total entries in this round
              </div>
            )}
          </div>

          {/* Countdown */}
          {round ? (
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
          ) : !roundsLoading ? (
            <div className="text-center text-xs text-slate-500 py-1">No active {roundType} round — Darrell will start one soon.</div>
          ) : null}

          {/* My tickets row */}
          {round && round.my_tickets > 0 && (
            <div className="mt-3 flex items-center justify-between bg-green-950/40 border border-green-500/20 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-green-400" />
                <span className="text-xs font-bold text-green-300">Your tickets this round</span>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-green-400 tabular-nums">{round.my_tickets}</div>
                {round.total_entries > 0 && (
                  <div className="text-[10px] text-green-700">
                    odds ≈ {((round.my_tickets / round.total_entries) * 100).toFixed(2)}%
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Inner tabs ── */}
        <div className="px-5 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-4 bg-gray-900/60 border border-white/5 mb-4 h-8">
              {[
                { v: "earn", icon: <Gift className="h-3 w-3" />, label: "Earn" },
                { v: "mine", icon: <Star className="h-3 w-3" />, label: "Mine" },
                { v: "winners", icon: <Trophy className="h-3 w-3" />, label: "Winners" },
                { v: "stats", icon: <BarChart3 className="h-3 w-3" />, label: "Stats" },
              ].map(({ v, icon, label }) => (
                <TabsTrigger key={v} value={v} className="text-[10px] font-bold data-[state=active]:bg-yellow-600/20 data-[state=active]:text-yellow-300 flex items-center gap-1 px-1">
                  {icon}{label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── EARN TAB ── */}
            <TabsContent value="earn" className="space-y-4">
              <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-yellow-300 mb-1">🎟️ How to earn tickets</p>
                <p className="text-[11px] text-slate-400">
                  Lottery tickets are given free — no purchase required. Earn them by booking and completing jobs,
                  hitting milestones, and through special bonuses from Darrell.
                </p>
              </div>

              <div className="space-y-2">
                {EARN_RULES.map(({ icon, label, tickets, desc }) => (
                  <div key={label} className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5">
                    <div className="shrink-0">{icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{label}</p>
                      <p className="text-[11px] text-slate-500">{desc}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-black text-yellow-400">{tickets}</div>
                      <div className="text-[9px] text-yellow-700 font-bold">ticket{typeof tickets === "number" && tickets !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-center">
                <p className="text-[10px] text-slate-500">
                  Tickets are automatically added after each qualifying activity.
                  Contact Darrell if you believe you're missing tickets.
                </p>
              </div>
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
                      { label: "This Round", val: round?.my_tickets ?? 0, color: "text-yellow-400", icon: <Ticket className="h-4 w-4" /> },
                      { label: "Total Wins", val: myData.wins.length, color: "text-green-400", icon: <Trophy className="h-4 w-4" /> },
                      { label: "Entries", val: myData.entries.length, color: "text-blue-400", icon: <History className="h-4 w-4" /> },
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

                  {/* Entry history */}
                  {myData.entries.length > 0 ? (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Entry History</p>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {myData.entries.map((e: any, i: number) => (
                          <div key={i} className="flex justify-between items-center text-xs bg-white/[0.02] rounded-lg px-3 py-2">
                            <div>
                              <span className="text-white font-bold">{e.tickets} ticket{e.tickets !== 1 ? "s" : ""}</span>
                              {e.source && e.source !== 'purchase' && (
                                <span className="text-yellow-600 ml-1.5 capitalize">· {e.source.replace(/_/g, " ")}</span>
                              )}
                            </div>
                            <div className="text-[9px] text-muted-foreground">{timeAgo(e.created_at)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <Ticket className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-bold">No tickets yet</p>
                      <p className="text-xs mt-1">Book a job or complete services to earn lottery entries!</p>
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
                  <p className="text-xs mt-1">First draw happens when Darrell triggers it</p>
                </div>
              ) : (
                history.map((w, i) => (
                  <div key={w.id} className={`rounded-xl border px-4 py-3 ${i === 0 ? "border-yellow-500/40 bg-yellow-950/20" : "border-white/5 bg-white/[0.02]"}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {i === 0 && <Crown className="h-4 w-4 text-yellow-400" />}
                        <div>
                          <div className="text-sm font-black text-white">{w.first_name || w.username || "Winner"}</div>
                          <div className="text-[10px] text-muted-foreground">
                            Round #{w.round_number} · {w.round_type === "monthly" ? "🌙 Mega" : "⚡ Weekly"}
                            {w.win_streak > 1 && <span className="ml-1 text-orange-400">🔥 {w.win_streak}-streak</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-black text-yellow-400">{formatTokens(w.payout_amount)}</div>
                        <div className="text-[10px] text-yellow-700">JCMOVES</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            {/* ── STATS TAB ── */}
            <TabsContent value="stats" className="space-y-3">
              {round ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Total Entries", val: formatTokens(round.total_entries), color: "text-white" },
                      { label: "My Tickets", val: String(round.my_tickets), color: "text-yellow-400" },
                      { label: "Winner Pool", val: `${formatTokens(round.winner_pool)} JC`, color: "text-green-400" },
                      { label: "Seed Amount", val: `${formatTokens(round.seed_amount)} JC`, color: "text-blue-400" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 text-center">
                        <div className={`text-xl font-black ${color}`}>{val}</div>
                        <div className="text-[9px] text-muted-foreground font-medium mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 space-y-1.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Prize Pool Breakdown</p>
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
                </>
              ) : (
                <div className="text-center py-10 text-slate-500">
                  <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No active {roundType} round</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
