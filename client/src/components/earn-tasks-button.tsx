import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Coins, CheckCircle2, Circle, ChevronRight, X, Zap, Star, Trophy } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface MiningStatus {
  currentSession: any;
  accumulatedTokens: string;
  claimsRemainingToday: number;
  lastScriptureClaimDate: string | null;
  scriptureStreak: number;
  fitness: { pushups: number; situps: number };
  leadAddedToday: boolean;
  dailyBonusClaimed: boolean;
}

interface GamificationStats {
  data: {
    canCheckIn: boolean;
    nextCheckInAt?: string | null;
  };
}

function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

export function EarnTasksButton() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: miningStatus } = useQuery<MiningStatus>({
    queryKey: ["/api/mining/status"],
    enabled: !!user,
    refetchInterval: open ? 10000 : false,
  });

  const { data: gamificationData } = useQuery<GamificationStats>({
    queryKey: ["/api/gamification/stats"],
    enabled: !!user,
    refetchInterval: open ? 15000 : false,
  });

  // After each task succeeds, refresh status and try to claim the completion bonus
  function afterTaskSuccess() {
    queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/gamification/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
  }

  const completionBonusMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gamification/daily-tasks-bonus", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      toast({
        title: "🏆 Daily Bonus Unlocked!",
        description: `+500 JCMOVES for completing all daily tasks!`,
      });
    },
  });

  const checkinMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gamification/checkin", {}),
    onSuccess: (data: any) => {
      afterTaskSuccess();
      toast({ title: "Check-in complete!", description: `+${(data as any)?.tokensAwarded || 100} JCMOVES earned!` });
    },
    onError: () => toast({ title: "Check-in failed", variant: "destructive" }),
  });

  const miningMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/start"),
    onSuccess: () => {
      afterTaskSuccess();
      toast({ title: "Mining started!", description: "Tokens are now accumulating." });
    },
  });

  const claimMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/claim"),
    onSuccess: (data: any) => {
      afterTaskSuccess();
      toast({ title: "Tokens claimed!", description: `+${parseFloat((data as any)?.tokensClaimed || 0).toFixed(2)} JCMOVES!` });
    },
  });

  const scriptureMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/scripture-claim", {}),
    onSuccess: (data: any) => {
      afterTaskSuccess();
      const streakBonus = (data as any)?.streakBonus || 0;
      toast({
        title: streakBonus > 0 ? "🔥 7-Day Streak Bonus!" : "Scripture Claimed!",
        description: streakBonus > 0
          ? `+${(data as any)?.amount} JCMOVES! (100 + 300 streak bonus)`
          : `+100 JCMOVES! Day ${(data as any)?.streak || 1} streak 🔥`,
      });
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      toast({
        title: "Already claimed",
        description: msg.includes("Already claimed") ? "You've already claimed your scripture reward today." : "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const fitnessMutation = useMutation({
    mutationFn: ({ type, count }: { type: 'pushups' | 'situps'; count: number }) =>
      apiRequest("POST", "/api/mining/fitness", { type, count }),
    onSuccess: (data: any) => {
      afterTaskSuccess();
      toast({ title: "Fitness logged!", description: `Mining speed boosted to ${(data as any)?.newSpeed}x 💪` });
    },
    onError: () => toast({ title: "Failed to log fitness", variant: "destructive" }),
  });

  const canClaim = !!miningStatus?.currentSession &&
    parseFloat(miningStatus?.accumulatedTokens || "0") > 0;
  const miningDone = (miningStatus?.claimsRemainingToday ?? 3) < 3;
  const checkinDone = gamificationData ? !gamificationData.data.canCheckIn : false;
  const scriptureDone = isToday(miningStatus?.lastScriptureClaimDate);
  const pushupsToday = miningStatus?.fitness?.pushups || 0;
  const situpsToday = miningStatus?.fitness?.situps || 0;
  const pushupsGoalDone = pushupsToday >= 10;
  const situpsGoalDone = situpsToday >= 10;
  const leadDone = !!(miningStatus?.leadAddedToday);
  const dailyBonusClaimed = !!(miningStatus?.dailyBonusClaimed);

  const scriptureStreak = miningStatus?.scriptureStreak || 0;
  const streakToBonus = scriptureStreak > 0 ? (7 - (scriptureStreak % 7 || 7)) : 7;

  const isEmployee = user?.role === 'employee' || user?.role === 'admin' || user?.role === 'business_owner';

  const tasks = [
    {
      id: "mining",
      label: "Mine JCMOVES",
      description: canClaim
        ? `Claim ${parseFloat(miningStatus!.accumulatedTokens).toFixed(2)} tokens`
        : miningStatus?.currentSession
          ? "Mining in progress…"
          : "Start your daily mining session",
      reward: "+864",
      done: miningDone,
      action: () => {
        if (canClaim) { claimMutation.mutate(); }
        else if (!miningStatus?.currentSession) { miningMutation.mutate(); }
        else { setOpen(false); setLocation("/mining"); }
      },
      actionLabel: canClaim ? "Claim Now" : miningStatus?.currentSession ? "View" : "Start",
      isPending: miningMutation.isPending || claimMutation.isPending,
    },
    {
      id: "checkin",
      label: "Daily Check-In",
      description: checkinDone
        ? `Next: ${gamificationData?.data.nextCheckInAt ? new Date(gamificationData.data.nextCheckInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "tomorrow"}`
        : "Check in to earn bonus tokens",
      reward: "+100",
      done: checkinDone,
      action: () => checkinMutation.mutate(),
      actionLabel: "Check In",
      isPending: checkinMutation.isPending,
    },
    ...(isEmployee ? [{
      id: "scripture",
      label: "Daily Scripture",
      description: scriptureDone
        ? scriptureStreak > 0 ? `🔥 ${scriptureStreak} day streak${streakToBonus < 7 ? ` — ${streakToBonus} to +300 bonus` : ""}` : "Claimed today"
        : scriptureStreak > 0 ? `🔥 ${scriptureStreak} day streak — claim to continue!` : "Read & claim daily scripture",
      reward: "+100",
      done: scriptureDone,
      action: () => scriptureMutation.mutate(),
      actionLabel: "Claim Now",
      isPending: scriptureMutation.isPending,
      badge: scriptureStreak >= 6 ? "🔥 Almost!" : undefined,
    }] : []),
    {
      id: "pushups",
      label: "10 Pushups",
      description: pushupsGoalDone
        ? `Done! ${pushupsToday} reps today`
        : `${pushupsToday}/10 reps today — boosts your mining speed`,
      reward: "+speed",
      done: pushupsGoalDone,
      action: () => fitnessMutation.mutate({ type: 'pushups', count: 10 }),
      actionLabel: pushupsGoalDone ? "Log More" : "Log 10",
      isPending: fitnessMutation.isPending,
    },
    {
      id: "situps",
      label: "10 Situps",
      description: situpsGoalDone
        ? `Done! ${situpsToday} reps today`
        : `${situpsToday}/10 reps today — boosts your mining speed`,
      reward: "+speed",
      done: situpsGoalDone,
      action: () => fitnessMutation.mutate({ type: 'situps', count: 10 }),
      actionLabel: situpsGoalDone ? "Log More" : "Log 10",
      isPending: fitnessMutation.isPending,
    },
    {
      id: "add_job",
      label: "Add a Job Lead",
      description: leadDone
        ? "Lead submitted today — great work!"
        : "Submit a new moving or junk removal lead",
      reward: "+500",
      done: leadDone,
      action: () => { setOpen(false); setLocation("/employee/add-job"); },
      actionLabel: leadDone ? "Add More" : "Add Lead",
      isPending: false,
    },
  ];

  const doneCount = tasks.filter(t => t.done).length;
  const totalCount = tasks.length;
  const progressPct = Math.round((doneCount / totalCount) * 100);
  const pendingCount = totalCount - doneCount;
  const allDone = doneCount === totalCount;

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-6 z-50 bg-gradient-to-br from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white p-3.5 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 group"
        aria-label="Earn JCMOVES tasks"
      >
        <Coins className="h-5 w-5" />
        {pendingCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-extrabold w-5 h-5 rounded-full flex items-center justify-center shadow">
            {pendingCount}
          </span>
        )}
        <span className="absolute -top-8 right-0 bg-yellow-700 text-yellow-100 text-xs px-2 py-1 rounded-full whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Earn JCMOVES
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border sticky top-0 bg-background z-10">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Coins className="h-4 w-4 text-yellow-500" />
                Earn JCMOVES
              </DialogTitle>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Complete all {totalCount} daily tasks for a <span className="text-yellow-500 font-bold">+500 JCMOVES bonus!</span></p>

            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Today's progress</span>
                <span className="font-semibold text-yellow-500">{doneCount}/{totalCount} done</span>
              </div>
              <Progress value={progressPct} className="h-2 bg-muted" />
            </div>
          </DialogHeader>

          <div className="px-4 py-3 space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  task.done
                    ? "border-green-500/20 bg-green-500/5 opacity-70"
                    : "border-border bg-card hover:bg-accent/30"
                }`}
              >
                <div className="flex-shrink-0">
                  {task.done
                    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                    : <Circle className="h-5 w-5 text-muted-foreground" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className={`text-sm font-semibold leading-tight ${task.done ? "line-through text-muted-foreground" : ""}`}>
                      {task.label}
                    </p>
                    {'badge' in task && (task as any).badge && (
                      <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full font-bold">{(task as any).badge}</span>
                    )}
                    <span className="text-xs text-yellow-500 font-bold flex items-center gap-0.5 shrink-0">
                      <Star className="h-3 w-3" />{task.reward} JCMOVES
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{task.description}</p>
                </div>

                <Button
                  size="sm"
                  className={`shrink-0 text-xs px-3 h-8 font-semibold ${
                    task.done && task.id !== 'pushups' && task.id !== 'situps' && task.id !== 'add_job'
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white"
                  }`}
                  onClick={task.action}
                  disabled={task.isPending || (task.done && task.id !== 'pushups' && task.id !== 'situps' && task.id !== 'add_job')}
                >
                  {task.isPending ? <Zap className="h-3 w-3 animate-spin" /> : (
                    <>{task.actionLabel}<ChevronRight className="h-3 w-3 ml-0.5" /></>
                  )}
                </Button>
              </div>
            ))}
          </div>

          {/* Daily completion bonus section */}
          <div className="px-5 pb-5">
            {allDone && !dailyBonusClaimed && (
              <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/40 rounded-xl p-4 text-center">
                <Trophy className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-yellow-300">All Tasks Complete!</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Claim your 500 JCMOVES daily completion bonus</p>
                <Button
                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold"
                  onClick={() => completionBonusMutation.mutate()}
                  disabled={completionBonusMutation.isPending}
                >
                  {completionBonusMutation.isPending
                    ? <><Zap className="h-4 w-4 animate-spin mr-2" />Claiming...</>
                    : <><Trophy className="h-4 w-4 mr-2" />Claim +500 JCMOVES</>
                  }
                </Button>
              </div>
            )}

            {allDone && dailyBonusClaimed && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-green-400">All done for today! +500 JCMOVES earned 🏆</p>
                <p className="text-xs text-muted-foreground mt-1">Come back tomorrow for more rewards.</p>
              </div>
            )}

            {!allDone && (
              <div className="border border-yellow-500/20 rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Complete all {totalCount} tasks to unlock <span className="text-yellow-500 font-bold">+500 JCMOVES</span> bonus
                </p>
                <p className="text-xs text-yellow-600 mt-0.5">{pendingCount} task{pendingCount !== 1 ? 's' : ''} remaining</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
