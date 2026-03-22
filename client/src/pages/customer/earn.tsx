import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, Coins, Clock, Gift, Users, Star, ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MiningStatus {
  currentSession: { startedAt: string } | null;
  accumulatedTokens: string;
  timeRemaining: number;
  claimsRemainingToday: number;
  miningSpeed: string;
  streakCount: number;
}

interface FaucetStatus {
  canClaim: boolean;
  nextClaimIn: number;
  dailyBonus: number;
}

export default function CustomerEarnPage() {
  const { toast } = useToast();

  const { data: mining, isLoading: miningLoading } = useQuery<MiningStatus>({
    queryKey: ["/api/mining/status"],
  });

  const claimMining = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/claim"),
    onSuccess: async (res: Response) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/balance"] });
      toast({ title: "Tokens claimed!", description: `+${data?.tokensEarned || 0} JCMOVES added to your wallet.` });
    },
    onError: () => toast({ title: "Error", description: "Could not claim tokens right now.", variant: "destructive" }),
  });

  const startMining = useMutation({
    mutationFn: () => apiRequest("POST", "/api/mining/start"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      toast({ title: "Mining started!", description: "Come back in 24 hours to claim your tokens." });
    },
    onError: () => toast({ title: "Error", description: "Could not start mining.", variant: "destructive" }),
  });

  const faucetClaim = useMutation({
    mutationFn: () => apiRequest("POST", "/api/faucet/claim"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      toast({ title: "Faucet claimed!", description: "Daily bonus JCMOVES added." });
    },
    onError: () => toast({ title: "Faucet", description: "Faucet is on cooldown.", variant: "destructive" }),
  });

  const acc = parseFloat(mining?.accumulatedTokens ?? "0");
  const claimsLeft = mining?.claimsRemainingToday ?? 0;
  const streak = mining?.streakCount ?? 0;
  const isMining = !!mining?.currentSession;
  const timeRemaining = mining?.timeRemaining ?? 0;
  const totalSeconds = Math.floor(timeRemaining / 1000);
  const hoursLeft = Math.floor(totalSeconds / 3600);
  const minsLeft = Math.floor((totalSeconds % 3600) / 60);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-2xl font-bold">Earn Tokens</h1>
          <p className="text-sm text-muted-foreground">Mine, claim, and grow your JCMOVES balance</p>
        </div>

        {/* Mining Card */}
        <Card className={isMining ? "border-amber-500/50 bg-amber-500/5" : "border-primary/30"}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-amber-500" />
              Daily Mining
              {isMining && <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">Active</Badge>}
            </CardTitle>
            <CardDescription>Mine JCMOVES tokens every 24 hours</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {miningLoading ? (
              <div className="h-20 bg-muted animate-pulse rounded-xl" />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-black text-amber-500">{acc.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">JCMOVES accumulated</p>
                  </div>
                  {streak > 0 && (
                    <div className="text-center">
                      <p className="text-2xl font-bold">🔥 {streak}</p>
                      <p className="text-xs text-muted-foreground">Day streak</p>
                    </div>
                  )}
                </div>

                {isMining && timeRemaining > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Time remaining</span>
                      <span>{hoursLeft}h {minsLeft}m</span>
                    </div>
                    <Progress value={Math.max(0, 100 - (timeRemaining / (86400 * 1000) * 100))} className="h-2" />
                  </div>
                )}

                <div className="flex gap-2">
                  {!isMining ? (
                    <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => startMining.mutate()} disabled={startMining.isPending}>
                      {startMining.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                      Start Mining
                    </Button>
                  ) : (
                    <Button className="flex-1" onClick={() => claimMining.mutate()} disabled={claimMining.isPending || acc === 0 || claimsLeft === 0}>
                      {claimMining.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Coins className="h-4 w-4 mr-2" />}
                      Claim {acc.toFixed(0)} JCMOVES
                    </Button>
                  )}
                  {claimsLeft > 0 && (
                    <Badge variant="outline" className="self-center text-xs">{claimsLeft} claims left today</Badge>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Faucet / Daily bonus */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-5 w-5 text-green-500" />
              Daily Faucet
            </CardTitle>
            <CardDescription>Free tokens once every 24 hours</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => faucetClaim.mutate()} disabled={faucetClaim.isPending}>
              {faucetClaim.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Gift className="h-4 w-4 mr-2" />}
              Claim Daily Tokens
            </Button>
          </CardContent>
        </Card>

        {/* More ways to earn */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">More Ways to Earn</p>

          <Link href="/book">
            <button className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-muted hover:border-primary/40 transition-all bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-xl">
                  <CheckCircle className="h-5 w-5 text-blue-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Book a Job</p>
                  <p className="text-xs text-muted-foreground">Earn 50 + $1 = 15 JCMOVES on completion</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </Link>

          <Link href="/staking">
            <button className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-muted hover:border-primary/40 transition-all bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-xl">
                  <Star className="h-5 w-5 text-purple-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Stake & Earn Yield</p>
                  <p className="text-xs text-muted-foreground">Lock tokens for passive JCMOVES rewards</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </Link>

          <Link href="/profile">
            <button className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-muted hover:border-primary/40 transition-all bg-muted/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-xl">
                  <Users className="h-5 w-5 text-green-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Refer a Friend</p>
                  <p className="text-xs text-muted-foreground">+500 JCMOVES per new customer</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
