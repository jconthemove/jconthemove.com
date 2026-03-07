import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Crown, Flame, Copy, CheckCircle2, History, X, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface JackpotRow {
  type: string;
  current_value: number;
  starting_value: number;
  last_winner_name?: string | null;
  last_won_amount?: number | null;
}

interface SpinResult {
  prizeIndex: number;
  tokens: number;
  label: string;
  prizeType: string;
  jackpotTypeWon?: string | null;
  jackpotAmountWon?: number | null;
  couponCode?: string | null;
  couponExpiry?: string | null;
  mysteryResult?: {
    type: string;
    value: number;
    couponCode?: string;
    freeSpin?: boolean;
  } | null;
}

interface ActivityEvent {
  id: number;
  event_type: string;
  message: string;
  created_at: string;
}

interface SpinHistoryRow {
  id: number;
  prize_label: string;
  prize_tokens: number;
  prize_type: string;
  jackpot_type_won?: string | null;
  created_at: string;
}

interface QuantumSpinProps {
  open: boolean;
  onClose: () => void;
  redemptionId?: number;
}

// ─────────────────────────────────────────────────────────────
// Particle data
// ─────────────────────────────────────────────────────────────
function makeParticles(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360 + Math.random() * 15;
    const dist = 70 + Math.random() * 50;
    const rad = (angle * Math.PI) / 180;
    return {
      x: Math.cos(rad) * dist,
      y: Math.sin(rad) * dist,
      color: i % 3 === 0 ? "#f97316" : i % 3 === 1 ? "#eab308" : "#3b82f6",
      size: 3 + Math.random() * 4,
      delay: Math.random() * 0.3,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Time ago helper
// ─────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────
// QuantumSpinDialog
// ─────────────────────────────────────────────────────────────
export function SpinWheelDialog({ open, onClose, redemptionId }: QuantumSpinProps) {
  type AnimState = "idle" | "deducting" | "animating" | "flash" | "result";

  const [animState, setAnimState] = useState<AnimState>("idle");
  const [result, setResult] = useState<SpinResult | null>(null);
  const [particles, setParticles] = useState<ReturnType<typeof makeParticles>>([]);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionSpinCount, setSessionSpinCount] = useState(0);
  const [claimedMilestones, setClaimedMilestones] = useState<Set<number>>(new Set());
  const [isAutoSpin, setIsAutoSpin] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSpinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const { data: jackpots = [] } = useQuery<JackpotRow[]>({
    queryKey: ["/api/reward-shop/jackpots"],
    refetchInterval: open ? 15000 : false,
    enabled: open,
  });

  const { data: feed = [] } = useQuery<ActivityEvent[]>({
    queryKey: ["/api/reward-shop/activity-feed"],
    refetchInterval: open ? 8000 : false,
    enabled: open,
  });

  const { data: history = [] } = useQuery<SpinHistoryRow[]>({
    queryKey: ["/api/reward-shop/spin-history"],
    enabled: open && showHistory,
  });

  const { data: freeSpins = [] } = useQuery<any[]>({
    queryKey: ["/api/reward-shop/free-spins"],
    enabled: open,
  });

  const { data: walletData } = useQuery<{ tokenBalance: string }>({
    queryKey: ["/api/rewards/wallet"],
    refetchInterval: open ? 10000 : false,
    enabled: open,
  });
  const walletBalance = parseFloat(walletData?.tokenBalance || "0");
  const spinCost = 100;
  const canAffordSpin = walletBalance >= spinCost || freeSpins.length > 0;

  const mini = jackpots.find(j => j.type === "mini");
  const major = jackpots.find(j => j.type === "major");

  const clearTimers = useCallback(() => {
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
  }, []);

  const streakBonusMutation = useMutation({
    mutationFn: async (milestone: number) => {
      const res = await apiRequest("POST", "/api/reward-shop/streak-bonus", { milestone });
      return res.json() as Promise<{ milestone: number; bonusTokens: number; mysteryType: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/activity-feed"] });
      const m = data.milestone;
      if (m === 10) toast({ title: "🔥 10-Spin Streak!", description: `+100 JCMOVES bonus credited to your wallet!` });
      else if (m === 30) toast({ title: "🔥🔥 30-Spin Streak!", description: `+500 JCMOVES streak bonus! You're on fire!` });
      else if (m === 50) toast({ title: "🎁 50-Spin Mystery Bonus!", description: `Mystery box revealed! +${data.bonusTokens.toLocaleString()} JCMOVES!` });
    },
  });

  useEffect(() => {
    if (!open) {
      clearTimers();
      if (autoSpinTimerRef.current) clearTimeout(autoSpinTimerRef.current);
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
      setAnimState("idle");
      setResult(null);
      setParticles([]);
      setSessionSpinCount(0);
      setClaimedMilestones(new Set());
      setIsAutoSpin(false);
      setHoldProgress(0);
    }
  }, [open, clearTimers]);

  const spinMutation = useMutation({
    mutationFn: async (payload: { redemptionId?: number; useFreeSpinEntitlementId?: number }) => {
      const res = await apiRequest("POST", "/api/reward-shop/spin", payload);
      return res.json() as Promise<SpinResult>;
    },
    onSuccess: (data: SpinResult) => {
      // Phase 2: particles spiral in (0 → 1200ms already running), at 1200ms flash orb
      const t2 = setTimeout(() => setAnimState("flash"), 1200);
      // Phase 3: at 1500ms show result
      const t3 = setTimeout(() => {
        setResult(data);
        setAnimState("result");
        queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
        queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/jackpots"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/activity-feed"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/free-spins"] });
        // Streak tracking
        setSessionSpinCount(prev => {
          const newCount = prev + 1;
          setClaimedMilestones(claimed => {
            const MILESTONES = [10, 30, 50];
            for (const m of MILESTONES) {
              if (newCount >= m && !claimed.has(m)) {
                streakBonusMutation.mutate(m);
                const updated = new Set(claimed);
                updated.add(m);
                return updated;
              }
            }
            return claimed;
          });
          return newCount;
        });
      }, 1500);
      timerRef.current.push(t2, t3);
    },
    onError: (err: any) => {
      clearTimers();
      setAnimState("idle");
      setParticles([]);
      toast({ title: "Spin failed", description: err?.message || "Please try again", variant: "destructive" });
    },
  });

  // Auto-spin effect: fires next spin 700ms after a result lands
  useEffect(() => {
    if (animState === "result" && isAutoSpin && canAffordSpin) {
      autoSpinTimerRef.current = setTimeout(() => {
        if (isAutoSpin) handleSpinCore();
      }, 700);
    }
    return () => {
      if (autoSpinTimerRef.current) clearTimeout(autoSpinTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animState, isAutoSpin]);

  function handleSpinCore() {
    if (animState !== "idle" && animState !== "result") return;
    const freeSpin = freeSpins[0];
    setResult(null);
    setParticles(makeParticles(24));
    setAnimState("animating");
    spinMutation.mutate({
      redemptionId,
      useFreeSpinEntitlementId: freeSpin?.id,
    });
  }

  function handleSpin() {
    if (animState !== "idle") return;
    handleSpinCore();
  }

  function startHold() {
    let elapsed = 0;
    setHoldProgress(0);
    holdTimerRef.current = setInterval(() => {
      elapsed += 100;
      const pct = Math.min(100, (elapsed / 5000) * 100);
      setHoldProgress(pct);
      if (elapsed >= 5000) {
        clearInterval(holdTimerRef.current!);
        holdTimerRef.current = null;
        setHoldProgress(0);
        setIsAutoSpin(prev => {
          const next = !prev;
          toast({
            title: next ? "⚡ Auto-Spin ON" : "⏸ Auto-Spin OFF",
            description: next ? "Spins will fire automatically. Hold again to stop." : "Auto-spin stopped.",
          });
          return next;
        });
      }
    }, 100);
  }

  function cancelHold() {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress(0);
  }

  function handleCopy(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleClose() {
    if (animState === "animating" || animState === "deducting" || animState === "flash") return;
    onClose();
  }

  function handleSpinAgain() {
    handleSpinCore();
  }

  // Compute display values for result card
  const resultTokens = result?.tokens ?? 0;
  const isJackpot = !!result?.jackpotTypeWon;
  const isMystery = result?.prizeType === "mystery";
  const isCoupon = result?.prizeType === "coupon_10pct" || result?.prizeType === "coupon_25pct";
  const isCoffee = result?.prizeType === "gift_card_coffee";
  const displayCode = result?.couponCode || result?.mysteryResult?.couponCode || null;
  const hasFreeSpinEntry = !!freeSpins.length;

  // ─── Orb glow class based on state ────────────────────────
  const orbGlow = animState === "flash"
    ? "0 0 80px 40px rgba(255,255,255,0.9), 0 0 160px 80px rgba(251,191,36,0.6)"
    : animState === "animating"
    ? "0 0 40px 20px rgba(249,115,22,0.7), 0 0 80px 40px rgba(234,179,8,0.4)"
    : animState === "result" && isJackpot
    ? "0 0 60px 30px rgba(234,179,8,0.9), 0 0 120px 60px rgba(249,115,22,0.5)"
    : "0 0 24px 8px rgba(249,115,22,0.4), 0 0 48px 20px rgba(234,179,8,0.2)";

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-gray-950 border border-orange-500/20 max-h-[95vh] overflow-y-auto">

        {/* ── Header ── */}
        <div className="relative bg-gradient-to-br from-gray-900 via-gray-950 to-black px-5 pt-5 pb-4 border-b border-orange-500/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-orange-400" />
                <h2 className="font-black text-base text-white tracking-tight">JCMOVES Quantum Spin</h2>
              </div>
              <p className="text-[11px] text-orange-400/70 mt-0.5 italic">Probabilities collapse. Rewards appear instantly.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(v => !v)}
                className="text-muted-foreground hover:text-orange-400 transition-colors"
                title="Spin History"
              >
                <History className="h-4 w-4" />
              </button>
              {animState !== "animating" && animState !== "flash" && (
                <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Jackpot meters */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-orange-950/50 border border-orange-500/25 rounded-xl px-3 py-2 text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Flame className="h-3 w-3 text-orange-400" />
                <span className="text-[10px] font-bold text-orange-300 uppercase tracking-widest">Mini Jackpot</span>
              </div>
              <div className="text-xl font-black text-orange-400 tabular-nums">
                {mini ? parseInt(String(mini.current_value)).toLocaleString() : "5,000"}
              </div>
              <div className="text-[10px] text-orange-700 font-medium">JCMOVES</div>
            </div>
            <div className="bg-yellow-950/50 border border-yellow-500/25 rounded-xl px-3 py-2 text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Crown className="h-3 w-3 text-yellow-400" />
                <span className="text-[10px] font-bold text-yellow-300 uppercase tracking-widest">Major Jackpot</span>
              </div>
              <div className="text-xl font-black text-yellow-400 tabular-nums">
                {major ? parseInt(String(major.current_value)).toLocaleString() : "50,000"}
              </div>
              <div className="text-[10px] text-yellow-700 font-medium">JCMOVES</div>
            </div>
          </div>

          {/* Wallet balance */}
          <div className={`mt-2 rounded-xl px-4 py-2.5 flex items-center justify-between ${canAffordSpin ? "bg-green-950/40 border border-green-500/20" : "bg-red-950/40 border border-red-500/20"}`}>
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-yellow-400" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Your Balance</span>
            </div>
            <div className="text-right">
              <div className={`text-lg font-black tabular-nums ${canAffordSpin ? "text-green-400" : "text-red-400"}`}>
                {walletBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div className="text-[10px] text-muted-foreground font-medium">
                JCMOVES {freeSpins.length > 0 ? "· 🎁 free spin!" : canAffordSpin ? `· ${Math.floor(walletBalance / spinCost)} spins` : "· not enough"}
              </div>
            </div>
          </div>

          {/* Streak counter row */}
          {sessionSpinCount > 0 && (
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs font-bold text-orange-300">
                  {sessionSpinCount} spin{sessionSpinCount !== 1 ? "s" : ""} this session
                </span>
                <div className="flex gap-1">
                  {[10, 30, 50].map(m => (
                    <span
                      key={m}
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded ${claimedMilestones.has(m) ? "bg-green-500/20 text-green-400" : sessionSpinCount >= m * 0.7 ? "bg-orange-500/20 text-orange-400" : "bg-gray-800/60 text-gray-500"}`}
                    >
                      {claimedMilestones.has(m) ? "✓" : ""}{m}
                    </span>
                  ))}
                </div>
              </div>
              {isAutoSpin && (
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px] py-0 px-2 animate-pulse">
                  ⚡ AUTO
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* ── Main spin area ── */}
        <div className="px-5 py-5 flex flex-col items-center gap-5">

          {/* Orb + particles */}
          <div className="relative w-48 h-48 flex items-center justify-center select-none">
            {/* Orbiting rings */}
            <div
              className="absolute inset-2 rounded-full border border-orange-500/20"
              style={{
                animation: animState === "animating" || animState === "flash"
                  ? "spin 1s linear infinite" : "spin 4s linear infinite",
              }}
            />
            <div
              className="absolute inset-6 rounded-full border border-yellow-500/15"
              style={{
                animation: animState === "animating" || animState === "flash"
                  ? "spin 0.7s linear infinite reverse" : "spin 6s linear infinite reverse",
              }}
            />
            <div
              className="absolute inset-10 rounded-full border border-blue-500/20"
              style={{
                animation: animState === "animating" || animState === "flash"
                  ? "spin 0.5s linear infinite" : "spin 8s linear infinite",
              }}
            />

            {/* Particles */}
            {particles.map((p, i) => (
              <div
                key={i}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: p.size,
                  height: p.size,
                  background: p.color,
                  boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                  left: "50%",
                  top: "50%",
                  transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`,
                  transition: `transform ${1.2 - p.delay}s cubic-bezier(0.4, 0, 0.2, 1) ${p.delay}s, opacity 0.3s ease ${1.0 + p.delay}s`,
                  ...(animState === "animating" || animState === "flash" || animState === "result"
                    ? { transform: "translate(-50%, -50%) translate(0px, 0px)", opacity: 0 }
                    : {}),
                }}
              />
            ))}

            {/* Holographic orb */}
            <div
              className="relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                background: animState === "flash"
                  ? "radial-gradient(circle at 35% 35%, #ffffff, #fbbf24, #f97316)"
                  : "radial-gradient(circle at 35% 35%, #1e293b, #0f172a, #030712)",
                boxShadow: orbGlow,
                border: "1px solid rgba(249,115,22,0.3)",
                transition: "box-shadow 0.3s ease, background 0.2s ease",
              }}
            >
              {/* Inner glow */}
              <div
                className="absolute inset-2 rounded-full opacity-60"
                style={{
                  background: "radial-gradient(circle at 30% 30%, rgba(249,115,22,0.3), transparent 60%)",
                }}
              />

              {/* Orb content */}
              {animState === "idle" && (
                <div className="text-center z-10 relative">
                  <div className="text-2xl font-black text-orange-400">⚡</div>
                  <div className="text-[10px] text-orange-400/60 font-bold uppercase tracking-widest mt-0.5">SPIN</div>
                </div>
              )}
              {(animState === "animating" || animState === "flash") && (
                <div className="text-center z-10 relative">
                  <div
                    className="text-2xl font-black text-white"
                    style={{ animation: "pulse 0.4s ease-in-out infinite" }}
                  >
                    {animState === "flash" ? "✦" : "◉"}
                  </div>
                </div>
              )}
              {animState === "result" && !isJackpot && (
                <div className="text-center z-10 relative px-2">
                  {result?.prizeType === "tokens" && result.tokens > 0 && (
                    <>
                      <div className="text-base font-black text-yellow-300 leading-tight">{result.label}</div>
                      <div className="text-[9px] text-yellow-500 font-bold uppercase tracking-wider">JCMOVES</div>
                    </>
                  )}
                  {result?.prizeType === "mystery" && <div className="text-2xl">🎁</div>}
                  {(result?.prizeType === "coupon_10pct" || result?.prizeType === "coupon_25pct") && <div className="text-2xl">🎫</div>}
                  {result?.prizeType === "gift_card_coffee" && <div className="text-2xl">☕</div>}
                  {result?.prizeType === "tokens" && result.tokens === 0 && (
                    <div className="text-2xl">🌌</div>
                  )}
                </div>
              )}
              {animState === "result" && isJackpot && (
                <div className="text-center z-10 relative">
                  <div className="text-2xl font-black text-yellow-300" style={{ animation: "pulse 0.6s ease-in-out infinite" }}>
                    🏆
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Spin button / result card */}
          {animState === "idle" && (
            <div className="w-full space-y-2">
              {hasFreeSpinEntry && (
                <Badge className="w-full justify-center bg-green-500/20 text-green-400 border-green-500/30 py-1">
                  🎁 You have a free spin!
                </Badge>
              )}
              {isAutoSpin && (
                <Badge className="w-full justify-center bg-orange-500/20 text-orange-400 border-orange-500/30 py-1 animate-pulse">
                  ⚡ Auto-Spin Active — Hold 5s to stop
                </Badge>
              )}
              {/* Spin button with press-and-hold for auto-spin */}
              <div className="relative">
                <Button
                  className={`w-full h-14 text-base font-black tracking-wide disabled:opacity-50 disabled:cursor-not-allowed select-none ${
                    isAutoSpin
                      ? "bg-gradient-to-r from-orange-600 via-red-500 to-orange-600 hover:from-orange-700 hover:to-orange-700 text-white"
                      : "bg-gradient-to-r from-orange-500 via-yellow-500 to-orange-500 hover:from-orange-600 hover:to-orange-600 text-black"
                  }`}
                  style={{ boxShadow: isAutoSpin ? "0 0 24px rgba(249,115,22,0.7)" : "0 0 20px rgba(249,115,22,0.4)" }}
                  onClick={handleSpin}
                  onPointerDown={canAffordSpin ? startHold : undefined}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  disabled={!canAffordSpin}
                >
                  <Zap className="h-5 w-5 mr-2" />
                  {hasFreeSpinEntry ? "Spin — Free Entry!" : isAutoSpin ? "Auto-Spinning..." : "Spin for 100 JCMOVES"}
                </Button>
                {/* Hold progress bar */}
                {holdProgress > 0 && (
                  <div className="absolute bottom-0 left-0 h-1 rounded-b-lg bg-white/30 transition-all duration-100" style={{ width: `${holdProgress}%` }} />
                )}
              </div>
              <p className="text-center text-[10px] text-muted-foreground/50">
                {isAutoSpin
                  ? "Hold 5s to stop auto-spin · Streak bonuses active"
                  : "Tap to spin · Hold 5s to enable auto-spin"
                }
              </p>
            </div>
          )}

          {(animState === "animating" || animState === "flash") && (
            <div className="w-full text-center space-y-2">
              <div className="text-sm font-bold text-orange-400 animate-pulse">
                {animState === "flash" ? "✦ Collapsing probabilities..." : "⚡ Quantum calculating..."}
              </div>
              <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-yellow-400 rounded-full transition-all"
                  style={{
                    width: animState === "flash" ? "90%" : "50%",
                    transition: "width 0.8s ease",
                    boxShadow: "0 0 8px rgba(249,115,22,0.6)",
                  }}
                />
              </div>
            </div>
          )}

          {animState === "result" && result && (
            <div className="w-full animate-in fade-in zoom-in-95 duration-300">
              {isJackpot ? (
                <div className="text-center bg-gradient-to-br from-yellow-950/60 to-orange-950/40 border-2 border-yellow-400/50 rounded-2xl p-5"
                  style={{ boxShadow: "0 0 40px rgba(234,179,8,0.3)" }}>
                  <div className="text-4xl mb-2">🏆</div>
                  <div className="text-sm font-black text-yellow-300 uppercase tracking-widest mb-1">
                    {result.jackpotTypeWon === "major" ? "MAJOR" : "MINI"} JACKPOT!
                  </div>
                  <div className="text-3xl font-black text-yellow-400 mb-1">{(result.jackpotAmountWon || 0).toLocaleString()}</div>
                  <div className="text-xs text-yellow-600 font-bold uppercase tracking-wider mb-3">JCMOVES added to wallet</div>
                  <Button className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-black" onClick={handleClose}>
                    Claim Victory!
                  </Button>
                </div>
              ) : isMystery ? (
                <div className="text-center bg-gradient-to-br from-purple-950/60 to-indigo-950/40 border border-purple-500/30 rounded-2xl p-5">
                  <div className="text-4xl mb-2">🎁</div>
                  <div className="text-sm font-black text-purple-300 uppercase tracking-widest mb-1">Mystery Box!</div>
                  {result.mysteryResult?.type === "tokens" && (
                    <>
                      <div className="text-2xl font-black text-purple-300 mb-0.5">{result.mysteryResult.value.toLocaleString()}</div>
                      <div className="text-xs text-purple-500 font-bold uppercase tracking-wider mb-3">JCMOVES revealed</div>
                    </>
                  )}
                  {result.mysteryResult?.type === "free_spin" && (
                    <div className="text-sm text-green-400 font-bold mb-3">🎰 Free Spin added to your account!</div>
                  )}
                  {result.mysteryResult?.couponCode && (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground mb-1.5">Your reward code:</p>
                      <CouponCodeRow code={result.mysteryResult.couponCode} onCopy={handleCopy} copied={copied} />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold" onClick={handleSpinAgain} disabled={!canAffordSpin}>
                      Spin Again!
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={handleClose}>Done</Button>
                  </div>
                </div>
              ) : isCoupon || isCoffee ? (
                <div className="text-center bg-gradient-to-br from-blue-950/60 to-cyan-950/40 border border-blue-500/30 rounded-2xl p-5">
                  <div className="text-4xl mb-2">{isCoffee ? "☕" : "🎫"}</div>
                  <div className="text-sm font-black text-blue-300 uppercase tracking-widest mb-1">
                    {isCoffee ? "$5 Coffee Card!" : result.prizeType === "coupon_25pct" ? "25% Off!" : "10% Off!"}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {isCoffee
                      ? "Pending fulfillment — code added to your redemptions"
                      : result.prizeType === "coupon_25pct"
                      ? "25% off labor · min 2 movers 2hrs · expires in 30 days"
                      : "10% off (max $25) · min 2 movers 2hrs · expires in 90 days"}
                  </p>
                  {displayCode && (
                    <div className="mb-3">
                      <CouponCodeRow code={displayCode} onCopy={handleCopy} copied={copied} />
                      {result.couponExpiry && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Expires: {new Date(result.couponExpiry).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold" onClick={handleSpinAgain} disabled={!canAffordSpin}>
                      Spin Again!
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={handleClose}>Done</Button>
                  </div>
                </div>
              ) : resultTokens > 0 ? (
                <div className="text-center bg-gradient-to-br from-orange-950/60 to-yellow-950/40 border border-orange-500/30 rounded-2xl p-5">
                  <Coins className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
                  <div className="text-sm font-black text-orange-300 uppercase tracking-widest mb-1">You Won!</div>
                  <div className="text-3xl font-black text-yellow-400 mb-0.5">{resultTokens.toLocaleString()}</div>
                  <div className="text-xs text-yellow-600 font-bold uppercase tracking-wider mb-3">JCMOVES added to wallet</div>
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-black font-black" onClick={handleSpinAgain} disabled={!canAffordSpin}>
                      Spin Again!
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={handleClose}>Done</Button>
                  </div>
                </div>
              ) : (
                <div className="text-center bg-gray-900/60 border border-gray-700/30 rounded-2xl p-5">
                  <div className="text-4xl mb-2">🌌</div>
                  <div className="text-sm font-bold text-gray-400 mb-1">Quantum fluctuation...</div>
                  <p className="text-xs text-muted-foreground mb-3">No reward this time — jackpots grew!</p>
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-black" onClick={handleSpinAgain} disabled={!canAffordSpin}>
                      Try Again!
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={handleClose}>Exit</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Community Activity Feed */}
          {animState === "idle" && feed.length > 0 && (
            <div className="w-full">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Flame className="h-3 w-3 text-orange-400" /> Community Activity
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {feed.map(ev => (
                  <div key={ev.id} className="flex items-start justify-between gap-2 text-xs">
                    <span className="text-muted-foreground leading-tight">{ev.message}</span>
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">{timeAgo(ev.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spin History */}
          {showHistory && (
            <div className="w-full border-t border-border pt-4">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <History className="h-3 w-3" /> My Spin History
              </div>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No spins yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {history.map(row => (
                    <div key={row.id} className="flex items-center justify-between text-xs bg-card/40 rounded-lg px-3 py-2">
                      <div>
                        <span className="font-semibold">{row.prize_label}</span>
                        {row.jackpot_type_won && (
                          <Badge className="ml-1 bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] py-0">
                            {row.jackpot_type_won} jackpot
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground">{timeAgo(row.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Spin cost info */}
        {animState === "idle" && !isAutoSpin && (
          <div className="px-5 pb-4 text-center">
            <p className="text-[10px] text-muted-foreground/50">
              Fast 1.5s instant reveal · 🔥 Streak bonuses at 10, 30, and 50 spins
            </p>
          </div>
        )}
      </DialogContent>

      {/* CSS animation keyframes via style tag */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.2); opacity: 0.7; } }
      `}</style>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Coupon code row
// ─────────────────────────────────────────────────────────────
function CouponCodeRow({ code, onCopy, copied }: { code: string; onCopy: (c: string) => void; copied: boolean }) {
  return (
    <div className="flex items-center gap-2 bg-gray-900 border border-blue-500/20 rounded-lg px-3 py-2">
      <span className="font-mono font-bold text-blue-300 flex-1 text-sm tracking-wider">{code}</span>
      <button onClick={() => onCopy(code)} className="text-muted-foreground hover:text-blue-400 transition-colors">
        {copied ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
