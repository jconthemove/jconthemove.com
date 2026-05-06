import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import {
  Ticket, Trophy, Crown, ChevronLeft,
  Play, Lock, Unlock, RefreshCw, AlertTriangle, CheckCircle, Gift, Plus, Search, Coins
} from "lucide-react";

const GRANT_REASONS = [
  "job_booked",
  "job_completed",
  "crew_job_done",
  "tier_upgrade",
  "referral_bonus",
  "milestone_bonus",
  "admin_grant",
];

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
  const [activeSection, setActiveSection] = useState<"rounds" | "grant" | "winners" | "audit">("rounds");

  // Grant tickets form state
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [grantTickets, setGrantTickets] = useState(1);
  const [grantRoundType, setGrantRoundType] = useState<"weekly" | "monthly">("weekly");
  const [grantReason, setGrantReason] = useState("admin_grant");

  // New round form state
  const [newRoundType, setNewRoundType] = useState<"weekly" | "monthly">("weekly");
  const [newRoundDays, setNewRoundDays] = useState(7);
  const [newRoundSeed, setNewRoundSeed] = useState(500);

  const { data, isLoading, refetch } = useQuery<{ rounds: any[]; winners: any[]; audit: any[] }>({
    queryKey: ["/api/admin/lottery/status"],
    refetchInterval: 30000,
  });

  const { data: userResults = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/lottery/users", userSearch],
    queryFn: async () => {
      if (userSearch.length < 2) return [];
      const res = await fetch(`/api/admin/lottery/users?q=${encodeURIComponent(userSearch)}`, { credentials: "include" });
      return res.json();
    },
    enabled: userSearch.length >= 2 && activeSection === "grant",
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

  const grantMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/lottery/grant-tickets", body),
    onSuccess: (res: any) => {
      res.json().then((data: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/lottery/status"] });
        toast({ title: `✅ ${data.tickets_granted} ticket${data.tickets_granted !== 1 ? "s" : ""} granted to ${data.target}` });
        setSelectedUser(null);
        setUserSearch("");
        setGrantTickets(1);
      });
    },
    onError: (e: any) => toast({ title: "Grant failed", description: e.message, variant: "destructive" }),
  });

  const newRoundMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/lottery/new-round", body),
    onSuccess: (res: any) => {
      res.json().then((data: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/lottery/status"] });
        toast({ title: `🎟️ New ${data.round?.round_type} round #${data.round?.round_number} created!` });
      });
    },
    onError: (e: any) => toast({ title: "Failed to create round", description: e.message, variant: "destructive" }),
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
        <div className="flex gap-2 mb-4 flex-wrap">
          {([
            { id: "rounds", label: "📋 Rounds" },
            { id: "grant", label: "🎟️ Grant Tickets" },
            { id: "winners", label: "🏆 Winners" },
            { id: "audit", label: "📜 Audit Log" },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSection === id
                ? "bg-yellow-600/20 text-yellow-300 border border-yellow-500/30"
                : "bg-white/5 text-slate-400 border border-white/5 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* GRANT TICKETS */}
        {activeSection === "grant" && (
          <div className="space-y-5">
            {/* Create New Round */}
            <Card className="border-yellow-500/20 bg-yellow-950/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Plus className="h-4 w-4 text-yellow-400" />
                  <span className="font-black text-white text-sm">Create New Lottery Round</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Type</p>
                    <select
                      value={newRoundType}
                      onChange={e => setNewRoundType(e.target.value as any)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="weekly">⚡ Weekly</option>
                      <option value="monthly">🌙 Monthly</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Duration (days)</p>
                    <Input
                      type="number" min={1} max={60}
                      value={newRoundDays}
                      onChange={e => setNewRoundDays(parseInt(e.target.value) || 7)}
                      className="bg-slate-800 border-white/10 text-xs h-8"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Seed (JC)</p>
                    <Input
                      type="number" min={0}
                      value={newRoundSeed}
                      onChange={e => setNewRoundSeed(parseInt(e.target.value) || 500)}
                      className="bg-slate-800 border-white/10 text-xs h-8"
                    />
                  </div>
                </div>
                <Button
                  className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-black text-xs"
                  onClick={() => newRoundMutation.mutate({ round_type: newRoundType, duration_days: newRoundDays, seed_amount: newRoundSeed })}
                  disabled={newRoundMutation.isPending}
                >
                  {newRoundMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Create {newRoundType} Round
                </Button>
              </CardContent>
            </Card>

            {/* Grant Tickets to User */}
            <Card className="border-green-500/20 bg-green-950/10">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Gift className="h-4 w-4 text-green-400" />
                  <span className="font-black text-white text-sm">Grant Lottery Tickets</span>
                </div>
                <p className="text-[11px] text-slate-400">Award tickets to a customer or crew member for completing an activity.</p>

                {/* User search */}
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search by name or email…"
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); setSelectedUser(null); }}
                    className="bg-slate-800 border-white/10 text-sm pl-8 h-9"
                  />
                </div>

                {/* User results */}
                {userSearch.length >= 2 && !selectedUser && (
                  <div className="bg-slate-900 border border-white/10 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {userResults.length === 0 ? (
                      <p className="text-xs text-slate-500 px-3 py-2">No users found</p>
                    ) : userResults.map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedUser(u); setUserSearch(`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 border-b border-white/5 last:border-0 flex items-center justify-between"
                      >
                        <div>
                          <span className="text-white font-bold">{u.first_name} {u.last_name}</span>
                          {u.email && <span className="text-slate-400 ml-1.5">{u.email}</span>}
                        </div>
                        <span className="text-slate-500 capitalize">{u.role}</span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedUser && (
                  <div className="bg-green-950/30 border border-green-500/20 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-green-300">{selectedUser.first_name} {selectedUser.last_name}</span>
                    <button onClick={() => { setSelectedUser(null); setUserSearch(""); }} className="text-slate-400 hover:text-white text-xs">✕</button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Tickets</p>
                    <Input
                      type="number" min={1} max={500}
                      value={grantTickets}
                      onChange={e => setGrantTickets(parseInt(e.target.value) || 1)}
                      className="bg-slate-800 border-white/10 text-xs h-8"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Round</p>
                    <select
                      value={grantRoundType}
                      onChange={e => setGrantRoundType(e.target.value as any)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white h-8"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Reason</p>
                    <select
                      value={grantReason}
                      onChange={e => setGrantReason(e.target.value)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white h-8"
                    >
                      {GRANT_REASONS.map(r => (
                        <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <Button
                  className="w-full bg-green-700 hover:bg-green-600 text-white font-black text-xs"
                  onClick={() => {
                    if (!selectedUser) { return; }
                    grantMutation.mutate({ target_user_id: selectedUser.id, ticket_count: grantTickets, round_type: grantRoundType, reason: grantReason });
                  }}
                  disabled={!selectedUser || grantMutation.isPending}
                >
                  {grantMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Gift className="h-3.5 w-3.5 mr-1.5" />}
                  Grant {grantTickets} Ticket{grantTickets !== 1 ? "s" : ""} to {selectedUser?.first_name || "…"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

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
