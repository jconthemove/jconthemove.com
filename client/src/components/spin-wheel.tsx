import { useRef, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, Star, Trophy, X, Sparkles, Flame, Copy, CheckCircle2, Crown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SpinPrize {
  label: string;
  tokens: number;
  color: string;
  probability: number;
  type: string;
  icon?: string;
}

const PRIZES: SpinPrize[] = [
  { label: "250",     tokens: 250,  color: "#f97316", probability: 30, type: "tokens"           },
  { label: "500",     tokens: 500,  color: "#eab308", probability: 20, type: "tokens"           },
  { label: "750",     tokens: 750,  color: "#22c55e", probability: 13, type: "tokens"           },
  { label: "1,000",   tokens: 1000, color: "#3b82f6", probability: 8,  type: "tokens"           },
  { label: "100",     tokens: 100,  color: "#ef4444", probability: 10, type: "tokens"           },
  { label: "50",      tokens: 50,   color: "#8b5cf6", probability: 5,  type: "tokens"           },
  { label: "Nada",    tokens: 0,    color: "#4b5563", probability: 5,  type: "tokens"           },
  { label: "Mystery", tokens: 0,    color: "#a855f7", probability: 1,  type: "mystery",    icon: "🎁" },
  { label: "25% Off", tokens: 0,    color: "#ec4899", probability: 1,  type: "coupon_25pct",icon: "%" },
  { label: "Coffee",  tokens: 0,    color: "#78350f", probability: 2,  type: "gift_card_coffee", icon: "☕" },
  { label: "10% Off", tokens: 0,    color: "#0891b2", probability: 5,  type: "coupon_10pct", icon: "%" },
];

interface JackpotRow {
  id: number;
  type: string;
  current_value: number;
  starting_value: number;
  last_winner_name?: string | null;
  last_won_amount?: number | null;
  last_won_at?: string | null;
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
  mysteryTokens?: number | null;
}

interface SpinWheelProps {
  open: boolean;
  onClose: () => void;
  redemptionId?: number;
}

export function SpinWheelDialog({ open, onClose, redemptionId }: SpinWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<SpinResult | null>(null);
  const [canSpin, setCanSpin] = useState(true);
  const [copied, setCopied] = useState(false);
  const rotationRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const { toast } = useToast();

  const { data: jackpots = [] } = useQuery<JackpotRow[]>({
    queryKey: ["/api/reward-shop/jackpots"],
    refetchInterval: open ? 10000 : false,
    enabled: open,
  });

  const mini = jackpots.find(j => j.type === "mini");
  const major = jackpots.find(j => j.type === "major");
  const lastWinner = major?.last_winner_name
    ? major
    : mini?.last_winner_name
    ? mini
    : null;

  const spinMutation = useMutation({
    mutationFn: (rid: number | undefined) =>
      apiRequest("POST", "/api/reward-shop/spin", { redemptionId: rid }),
    onSuccess: (data: SpinResult) => {
      animateSpin(data.prizeIndex, data);
    },
    onError: (err: any) => {
      const msg = err?.message || "Spin failed";
      toast({ title: "Could not spin", description: msg, variant: "destructive" });
      setSpinning(false);
      setCanSpin(true);
    },
  });

  useEffect(() => {
    if (open) {
      setWon(null);
      setCanSpin(true);
      rotationRef.current = 0;
      drawWheel(0);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [open]);

  function drawWheel(rotation: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) / 2 - 8;
    const segAngle = (2 * Math.PI) / PRIZES.length;

    ctx.clearRect(0, 0, W, H);

    // Outer glow ring
    ctx.save();
    ctx.shadowColor = "rgba(251,191,36,0.5)";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 6, 0, 2 * Math.PI);
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    PRIZES.forEach((prize, i) => {
      const startAngle = rotation + i * segAngle;
      const endAngle = startAngle + segAngle;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = prize.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + segAngle / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 4;

      if (prize.icon) {
        ctx.font = "bold 13px system-ui";
        ctx.fillText(prize.icon, R - 10, 2);
        ctx.font = "9px system-ui";
        ctx.fillText(prize.label, R - 10, 14);
      } else if (prize.type === "tokens" && prize.tokens === 0) {
        ctx.font = "bold 11px system-ui";
        ctx.fillText("😢", R - 10, 2);
        ctx.font = "9px system-ui";
        ctx.fillText("Nada", R - 10, 14);
      } else {
        ctx.font = "bold 13px system-ui";
        ctx.fillText(prize.label, R - 10, 5);
        ctx.font = "9px system-ui";
        ctx.fillText("JCMOVES", R - 10, 17);
      }
      ctx.restore();
    });

    // Center cap
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, 2 * Math.PI);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
    grad.addColorStop(0, "#1f2937");
    grad.addColorStop(1, "#111827");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("JC", cx, cy + 4);
  }

  function animateSpin(prizeIdx: number, result: SpinResult) {
    setSpinning(true);
    setCanSpin(false);

    const segAngle = (2 * Math.PI) / PRIZES.length;
    const targetAngle = -Math.PI / 2 - (prizeIdx * segAngle + segAngle / 2);
    const extraSpins = 5 + Math.random() * 3;
    const finalAngle = targetAngle + extraSpins * 2 * Math.PI;
    const startTime = performance.now();
    const duration = 4500 + Math.random() * 1000;
    const startRotation = rotationRef.current;

    function easeOut(t: number) {
      return 1 - Math.pow(1 - t, 4);
    }

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const current = startRotation + (finalAngle - startRotation) * easeOut(t);
      rotationRef.current = current;
      drawWheel(current);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        setWon(result);
        queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
        queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/jackpots"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/items"] });
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }

  function handleSpin() {
    if (!canSpin || spinning) return;
    setSpinning(true);
    spinMutation.mutate(redemptionId);
  }

  function handleCopy(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isJackpotWin = won?.jackpotTypeWon != null;
  const isCoupon = won?.prizeType === "coupon_25pct" || won?.prizeType === "coupon_10pct" || won?.prizeType === "gift_card_coffee";

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !spinning) onClose(); }}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden bg-gray-950 border border-yellow-500/30 max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-600/20 to-orange-600/10 px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              <h2 className="font-bold text-base">JCMOVES Prize Wheel</h2>
            </div>
            {!spinning && (
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {!redemptionId && (
            <p className="text-xs text-muted-foreground mt-0.5">Each spin costs <span className="text-yellow-400 font-semibold">100 JCMOVES</span></p>
          )}
          {redemptionId && (
            <p className="text-xs text-green-400 mt-0.5">Free spin from marketplace entry!</p>
          )}
        </div>

        {/* Jackpot meters */}
        <div className="px-4 pt-3 grid grid-cols-2 gap-2">
          {/* Mini jackpot */}
          <div className="bg-orange-950/40 border border-orange-500/30 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Flame className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-bold text-orange-300 uppercase tracking-wide">Mini Jackpot</span>
            </div>
            <div className="text-lg font-black text-orange-400">
              {mini ? mini.current_value.toLocaleString() : "5,000"}
            </div>
            <div className="text-[10px] text-orange-600">JCMOVES</div>
          </div>
          {/* Major jackpot */}
          <div className="bg-yellow-950/40 border border-yellow-500/30 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Crown className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-bold text-yellow-300 uppercase tracking-wide">Major Jackpot</span>
            </div>
            <div className="text-lg font-black text-yellow-400">
              {major ? major.current_value.toLocaleString() : "50,000"}
            </div>
            <div className="text-[10px] text-yellow-600">JCMOVES</div>
          </div>
        </div>

        {/* Last jackpot winner */}
        {lastWinner?.last_winner_name && (
          <div className="mx-4 mt-2 bg-purple-950/30 border border-purple-500/20 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <p className="text-[11px] text-purple-300">
              <span className="font-semibold">{lastWinner.last_winner_name}</span> won{" "}
              <span className="text-yellow-400 font-bold">{lastWinner.last_won_amount?.toLocaleString()} JCMOVES</span>{" "}
              ({lastWinner.type} jackpot)
            </p>
          </div>
        )}

        <div className="px-5 py-4 flex flex-col items-center gap-4">
          {/* Pointer triangle */}
          <div className="relative">
            <div
              className="absolute left-1/2 -translate-x-1/2 -top-3 z-10 w-0 h-0"
              style={{
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: "20px solid #f59e0b",
                filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
              }}
            />
            <canvas ref={canvasRef} width={280} height={280} className="rounded-full" />
          </div>

          {/* Result display */}
          {won ? (
            <div className="w-full text-center">
              {isJackpotWin ? (
                <div className="bg-gradient-to-br from-yellow-400/30 to-orange-500/20 border-2 border-yellow-400/60 rounded-xl p-4 animate-in zoom-in-75 duration-500">
                  <Crown className="h-10 w-10 text-yellow-400 mx-auto mb-2" />
                  <p className="text-lg font-black text-yellow-300 uppercase tracking-widest">
                    {won.jackpotTypeWon?.toUpperCase()} JACKPOT!
                  </p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <Coins className="h-6 w-6 text-yellow-500" />
                    <span className="text-3xl font-black text-yellow-500">{won.jackpotAmountWon?.toLocaleString()}</span>
                    <span className="text-base text-yellow-600 font-bold">JCMOVES</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Jackpot added to your wallet!</p>
                </div>
              ) : isCoupon ? (
                <div className="bg-gradient-to-br from-pink-500/20 to-purple-500/10 border border-pink-500/40 rounded-xl p-4 animate-in zoom-in-75 duration-500">
                  <Star className="h-8 w-8 text-pink-400 mx-auto mb-1" />
                  <p className="text-sm font-bold text-pink-300">
                    {won.prizeType === "gift_card_coffee" ? "Free Coffee!" : `You Won ${won.label}!`}
                  </p>
                  {won.couponCode && (
                    <>
                      <p className="text-xs text-muted-foreground mt-1 mb-2">Your promo code:</p>
                      <div className="flex items-center gap-2 bg-gray-900 border border-pink-500/30 rounded-lg px-3 py-2">
                        <span className="font-mono font-bold text-pink-300 flex-1 text-sm">{won.couponCode}</span>
                        <button onClick={() => handleCopy(won.couponCode!)} className="text-muted-foreground hover:text-pink-400">
                          {copied ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                      {won.couponExpiry && (
                        <p className="text-[11px] text-muted-foreground mt-1.5">
                          Valid 1 year — expires {new Date(won.couponExpiry).toLocaleDateString()}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">Use this code at checkout for your discount!</p>
                    </>
                  )}
                </div>
              ) : won.prizeType === "mystery" ? (
                <div className="bg-gradient-to-br from-purple-500/20 to-indigo-500/10 border border-purple-500/40 rounded-xl p-4 animate-in zoom-in-75 duration-500">
                  <span className="text-4xl block mb-1">🎁</span>
                  <p className="text-sm font-bold text-purple-300">Mystery Prize!</p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <Coins className="h-5 w-5 text-purple-400" />
                    <span className="text-2xl font-bold text-purple-400">{won.mysteryTokens?.toLocaleString() || won.tokens?.toLocaleString()}</span>
                    <span className="text-sm text-purple-500 font-semibold">JCMOVES</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Tokens added to your wallet!</p>
                </div>
              ) : won.tokens === 0 ? (
                <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4 animate-in zoom-in-75 duration-500">
                  <span className="text-4xl block mb-1">😢</span>
                  <p className="text-sm font-bold text-gray-400">Better luck next time!</p>
                  <p className="text-xs text-muted-foreground mt-1">The jackpots just got bigger...</p>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/10 border border-yellow-500/40 rounded-xl p-4 animate-in zoom-in-75 duration-500">
                  <Trophy className="h-8 w-8 text-yellow-400 mx-auto mb-1" />
                  <p className="text-sm font-bold text-yellow-300">You Won!</p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <Coins className="h-5 w-5 text-yellow-500" />
                    <span className="text-2xl font-bold text-yellow-500">{won.tokens?.toLocaleString()}</span>
                    <span className="text-sm text-yellow-600 font-semibold">JCMOVES</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Tokens added to your wallet!</p>
                </div>
              )}
              <Button
                className="mt-3 w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                onClick={onClose}
              >
                Awesome! Close
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-2">
              <Button
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black disabled:opacity-60"
                onClick={handleSpin}
                disabled={spinning || !canSpin || spinMutation.isPending}
              >
                {spinning || spinMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">🎰</span> Spinning...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    {redemptionId ? "Spin — Free Entry!" : "Spin the Wheel (100 JCMOVES)"}
                  </span>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Every spin grows the jackpots — you could win big!
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
