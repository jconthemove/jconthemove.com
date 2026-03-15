import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import {
  Ticket, Trophy, Clock, Coins, Flame, Crown, ChevronLeft,
  Play, Lock, Unlock, RefreshCw, AlertTriangle, CheckCircle, BarChart3
} from "lucide-react";

function fmt(n: number) { return (n ?? 0).toLocaleString(); }
function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-green-500/20 text-green-300 border-green-500/30",
  locked: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  drawn: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  payout_complete: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/20 text-red-300 border-red-500/30",
};

export default function AdminLotteryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<"rounds" | "winners" | "audit">("rounds");

  const { data, isLoading, refetch } = useQuery<{ rounds: any[]; winners: any[]; audit: any[] }>({
    queryKey: ["/api/admin/lottery/status"],
    refetchInterval: 30000,
  });

  const drawMutation = useMutation({
    mutationFn: (roundId: number) => apiRequest("POST", `/api/admin/lottery/draw/${roundId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lottery/status"] });
      toast({ title: "🎟️ Draw executed!", description: "Winner selected and round closed." });
    },
    onError: (e: any) => toast({ title: "Draw failed", description: e.message, variant: "destructive" }),
  });

  const freezeMutation = useMutation({
    mutationFn: (roundId: number) => apiRequest("POST", `/api/admin/lottery/freeze/${roundId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lottery/status"] });
      toast({ title: "🔒 Round frozen" });
    },
  });

  const openMutation = useMutation({
    mutationFn: (roundId: number) => apiRequest("POST", `/api/admin/lottery/open/${roundId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lottery/status"] });
      toast({ title: "🔓 Round re-opened" });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (winnerId: number) => apiRequest("POST", `/api/admin/lottery/retry-payout/${winnerId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lottery/status"] });
      toast({ title: "✅ Payout retried successfully" });
    },
    onError: (e: any) => toast({ title: "Retry failed", description: e.message, variant: "destructive" }),
  });

  if (!["admin", "business_owner"].includes(user?.role || "")) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-red-400">Access denied</p>
      </div>
    );
  }

  const rounds = data?.rounds ?? [];
  const winners = data?.winners ?? [];
  const audit = data?.audit ?? [];

  const openRounds = rounds.filter(r => r.status === "open");
  const activeWeekly = rounds.find(r => r.round_type === "weekly" && r.status === "open");
  const activeMonthly = rounds.find(r => r.round_type === "monthly" && r.status === "open");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/control">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
              <ChevronLeft className="h-4 w-4 mr-1" /> Control Panel
            </Button>
          </Link>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Ticket className="h-6 w-6 text-yellow-400" /> Lottery Control
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">Manage draws, freeze rounds, retry payouts, audit logs</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="border-white/10 text-slate-300"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
        </div>

        {/* Live stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            {
              label: "Weekly Jackpot",
              val: activeWeekly ? `${fmt(activeWeekly.displayed_jackpot)} JC` : "—",
              icon: <Coins className="h-4 w-4 text-yellow-400" />,
              color: "text-yellow-400",
            },
            {
              label: "Monthly Mega",
              val: activeMonthly ? `${fmt(activeMonthly.displayed_jackpot)} JC` : "—",
              icon: <Crown className="h-4 w-4 text-purple-400" />,
              color: "text-purple-400",
            },
            {
              label: "Tickets This Week",
              val: activeWeekly ? fmt(activeWeekly.tickets_sold) : "0",
              icon: <Ticket className="h-4 w-4 text-green-400" />,
              color: "text-green-400",
            },
            {
              label: "Total Winners",
              val: fmt(winners.length),
              icon: <Trophy className="h-4 w-4 text-orange-400" />,
              color: "text-orange-400",
            },
          ].map(({ label, val, icon, color }) => (
            <Card key={label} className="border-white/5 bg-white/[0.03]">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">{icon}<span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{label}</span></div>
                <div className={`text-lg font-black ${color}`}>{val}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pending payout alerts */}
        {winners.filter(w => w.payout_status === "pending" || w.payout_status === "retry").map(w => (
          <div key={w.id} className="bg-red-950/40 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-sm text-red-300 font-bold">
                Payout pending: {w.first_name || w.username} — {fmt(w.payout_amount)} JCMOVES
              </span>
            </div>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs"
              onClick={() => retryMutation.mutate(w.id)}
              disabled={retryMutation.isPending}
            >
              Retry Payout
            </Button>
          </div>
        ))}

        {/* Section tabs */}
        <div className="flex gap-2 mb-4">
          {(["rounds", "winners", "audit"] as const).map(s => (
            <button
              key={s}
              onClick={() => setActiveSection(s)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSection === s
                ? "bg-yellow-600/20 text-yellow-300 border border-yellow-500/30"
                : "bg-white/5 text-slate-400 border border-white/5 hover:text-white"}`}
            >
              {s === "rounds" ? "📋 Rounds" : s === "winners" ? "🏆 Winners" : "📜 Audit Log"}
            </button>
          ))}
        </div>

        {/* ROUNDS */}
        {activeSection === "rounds" && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="text-center py-12 text-slate-500"><RefreshCw className="h-8 w-8 animate-spin mx-auto" /></div>
            ) : rounds.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No lottery rounds found.</div>
            ) : rounds.map(r => (
              <Card key={r.id} className={`border ${r.round_type === "monthly" ? "border-purple-500/20 bg-purple-950/10" : "border-yellow-500/15 bg-yellow-950/10"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-white text-sm">
                          {r.round_type === "monthly" ? "🌙 Mega" : "⚡ Weekly"} Round #{r.round_number}
                        </span>
                        <Badge className={`text-[10px] ${STATUS_COLORS[r.status] || "bg-slate-500/20 text-slate-300"}`}>
                          {r.status}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Opens: {new Date(r.start_time).toLocaleString()} · Closes: {new Date(r.end_time).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-black ${r.round_type === "monthly" ? "text-purple-400" : "text-yellow-400"}`}>
                        {fmt(r.displayed_jackpot)}
                      </div>
                      <div className="text-[9px] text-muted-foreground">JCMOVES jackpot</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { label: "Tickets sold", val: fmt(r.tickets_sold) },
                      { label: "Winner pool", val: `${fmt(r.winner_pool)} JC` },
                      { label: "Burned", val: `${fmt(r.burn_pool)} JC` },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-white/[0.03] rounded-lg p-2 text-center">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
                        <div className="text-xs font-bold text-white mt-0.5">{val}</div>
                      </div>
                    ))}
                  </div>

                  {r.winner_user_id && (
                    <div className="bg-green-950/40 border border-green-500/20 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                      <span className="text-xs text-green-300 font-bold">
                        Winner: {r.winner_user_id} · Payout: {fmt(r.seed_amount + r.winner_pool)} JCMOVES · Status: {r.payout_status}
                      </span>
                    </div>
                  )}

                  {r.draw_error && (
                    <div className="bg-red-950/40 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
                      <span className="text-xs text-red-300">Error: {r.draw_error}</span>
                    </div>
                  )}

                  {/* Admin actions */}
                  <div className="flex gap-2 flex-wrap">
                    {(r.status === "open" || r.status === "locked") && (
                      <Button
                        size="sm"
                        className="bg-yellow-600 hover:bg-yellow-500 text-black font-black text-xs"
                        onClick={() => {
                          if (confirm(`Draw round ${r.round_number} now? This selects a winner and closes the round.`))
                            drawMutation.mutate(r.id);
                        }}
                        disabled={drawMutation.isPending}
                      >
                        <Play className="h-3 w-3 mr-1" /> Draw Now
                      </Button>
                    )}
                    {r.status === "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-yellow-500/30 text-yellow-400 text-xs"
                        onClick={() => freezeMutation.mutate(r.id)}
                        disabled={freezeMutation.isPending}
                      >
                        <Lock className="h-3 w-3 mr-1" /> Freeze
                      </Button>
                    )}
                    {r.status === "locked" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-green-500/30 text-green-400 text-xs"
                        onClick={() => openMutation.mutate(r.id)}
                        disabled={openMutation.isPending}
                      >
                        <Unlock className="h-3 w-3 mr-1" /> Re-open
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* WINNERS */}
        {activeSection === "winners" && (
          <div className="space-y-2">
            {winners.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No winners yet. First draw happens at round close.</p>
              </div>
            ) : winners.map((w, i) => (
              <Card key={w.id} className={`border ${w.round_type === "monthly" ? "border-purple-500/20" : "border-yellow-500/15"} bg-white/[0.02]`}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-black text-xs ${i === 0 ? "bg-yellow-500 text-black" : "bg-white/10 text-slate-300"}`}>
                      {i === 0 ? "🏆" : `#${i + 1}`}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">
                        {w.first_name || w.username || w.user_id}
                        {w.win_streak > 1 && <span className="ml-1 text-orange-400 text-[10px]">🔥×{w.win_streak}</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {w.round_type === "monthly" ? "Mega" : "Weekly"} #{w.round_number} · {timeAgo(w.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`font-black ${w.round_type === "monthly" ? "text-purple-400" : "text-yellow-400"}`}>{fmt(w.payout_amount)}</div>
                      <div className="text-[9px] text-muted-foreground">JCMOVES</div>
                    </div>
                    <Badge className={
                      w.payout_status === "complete"
                        ? "bg-green-500/20 text-green-300 border-green-500/30 text-[9px]"
                        : "bg-red-500/20 text-red-300 border-red-500/30 text-[9px]"
                    }>{w.payout_status}</Badge>
                    {(w.payout_status === "pending" || w.payout_status === "retry") && (
                      <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-500 text-white text-xs"
                        onClick={() => retryMutation.mutate(w.id)}
                        disabled={retryMutation.isPending}
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* AUDIT LOG */}
        {activeSection === "audit" && (
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
            {audit.length === 0 ? (
              <div className="text-center py-12 text-slate-500">No audit events yet.</div>
            ) : audit.map(a => (
              <div key={a.id} className="flex items-start justify-between bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge className={`text-[8px] flex-shrink-0 ${
                    a.event_type === "DRAW_EXECUTED" ? "bg-green-500/20 text-green-300 border-green-500/30"
                    : a.event_type === "PURCHASE" ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                    : a.event_type === "ERROR" ? "bg-red-500/20 text-red-300 border-red-500/30"
                    : "bg-slate-500/20 text-slate-300 border-slate-500/30"
                  }`}>{a.event_type}</Badge>
                  <span className="text-xs text-slate-300">{a.message}</span>
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-2">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
