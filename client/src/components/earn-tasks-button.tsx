import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Coins, CheckCircle2, Circle, ChevronRight, X, Zap, Star } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface MiningStatus {
  currentSession: any;
  accumulatedTokens: string;
  claimsRemainingToday: number;
  lastScriptureClaimDate: string | null;
}

interface GamificationStats {
  data: {
    canCheckIn: boolean;
    checkInStreak?: number;
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

  const checkinMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gamification/checkin", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gamification/stats"] });
      toast({
        title: "Check-in complete!",
        description: `+${data?.tokensAwarded || 100} JCMOVES earned!`,
      });
    },
    onError: () => {
      toast({ title: "Check-in failed", description: "Try again in a moment.", variant: "destructive" });
    },
  });

  const miningMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      toast({ title: "Mining started!", description: "Tokens are now accumulating." });
    },
  });

  const claimMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/claim"),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      toast({
        title: "Tokens claimed!",
        description: `+${parseFloat(data?.tokensClaimed || 0).toFixed(2)} JCMOVES!`,
      });
    },
  });

  const canClaim = !!miningStatus?.currentSession &&
    parseFloat(miningStatus?.accumulatedTokens || "0") > 0;
  const miningDone = (miningStatus?.claimsRemainingToday ?? 3) < 3;
  const checkinDone = gamificationData ? !gamificationData.data.canCheckIn : false;
  const scriptureDone = isToday(miningStatus?.lastScriptureClaimDate);

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
      reward: "+864 JCMOVES",
      done: miningDone,
      action: () => {
        if (canClaim) {
          claimMutation.mutate();
        } else if (!miningStatus?.currentSession) {
          miningMutation.mutate();
        } else {
          setOpen(false);
          setLocation("/mining");
        }
      },
      actionLabel: canClaim ? "Claim Now" : miningStatus?.currentSession ? "View Mining" : "Start Mining",
      isPending: miningMutation.isPending || claimMutation.isPending,
    },
    {
      id: "checkin",
      label: "Daily Check-In",
      description: checkinDone
        ? `Next check-in: ${gamificationData?.data.nextCheckInAt ? new Date(gamificationData.data.nextCheckInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "soon"}`
        : "Check in to earn bonus tokens",
      reward: "+100 JCMOVES",
      done: checkinDone,
      action: () => checkinMutation.mutate(),
      actionLabel: "Check In",
      isPending: checkinMutation.isPending,
    },
    ...(isEmployee ? [{
      id: "scripture",
      label: "Read Daily Scripture",
      description: scriptureDone ? "Claimed today — come back tomorrow" : "Read today's verse and earn tokens",
      reward: "+10 JCMOVES",
      done: scriptureDone,
      action: () => { setOpen(false); setLocation("/employee-home"); },
      actionLabel: "Read Now",
      isPending: false,
    }] : []),
    {
      id: "referral",
      label: "Invite a Friend",
      description: "Share your referral code and both earn",
      reward: "+2,500 JCMOVES",
      done: false,
      action: () => { setOpen(false); setLocation("/customer-portal?tab=referrals"); },
      actionLabel: "Share Code",
      isPending: false,
    },
    {
      id: "shop",
      label: "List an Item in Shop",
      description: "Post something to the community shop",
      reward: "+100 JCMOVES",
      done: false,
      action: () => { setOpen(false); setLocation("/shop/create"); },
      actionLabel: "Create Listing",
      isPending: false,
    },
    {
      id: "review",
      label: "Leave a Review",
      description: "Share your experience and earn tokens",
      reward: "+50 JCMOVES",
      done: false,
      action: () => { setOpen(false); setLocation("/leave-review"); },
      actionLabel: "Write Review",
      isPending: false,
    },
  ];

  const doneCount = tasks.filter(t => t.done).length;
  const totalCount = tasks.length;
  const progressPct = Math.round((doneCount / totalCount) * 100);
  const pendingCount = totalCount - doneCount;

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
            <p className="text-xs text-muted-foreground mt-1">Complete tasks to earn tokens. Get rewards for every action!</p>

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
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm font-semibold leading-tight ${task.done ? "line-through text-muted-foreground" : ""}`}>
                      {task.label}
                    </p>
                    <span className="text-xs text-yellow-500 font-bold flex items-center gap-0.5 shrink-0">
                      <Star className="h-3 w-3" />{task.reward}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight truncate">{task.description}</p>
                </div>

                {!task.done && (
                  <Button
                    size="sm"
                    className="shrink-0 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white text-xs px-3 h-8 font-semibold"
                    onClick={task.action}
                    disabled={task.isPending}
                  >
                    {task.isPending ? <Zap className="h-3 w-3 animate-spin" /> : (
                      <>{task.actionLabel}<ChevronRight className="h-3 w-3 ml-0.5" /></>
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {doneCount === totalCount && (
            <div className="px-5 pb-5 text-center">
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-green-400">All done for today!</p>
                <p className="text-xs text-muted-foreground mt-1">Come back tomorrow for more rewards.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
