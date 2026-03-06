import { useRef, useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, Star, Trophy, X, Sparkles } from "lucide-react";

interface SpinPrize {
  label: string;
  tokens: number;
  color: string;
  probability: number;
}

const PRIZES: SpinPrize[] = [
  { label: "100", tokens: 100, color: "#ef4444", probability: 25 },
  { label: "250", tokens: 250, color: "#f97316", probability: 22 },
  { label: "500", tokens: 500, color: "#eab308", probability: 18 },
  { label: "750", tokens: 750, color: "#22c55e", probability: 14 },
  { label: "1,000", tokens: 1000, color: "#3b82f6", probability: 10 },
  { label: "2,500", tokens: 2500, color: "#8b5cf6", probability: 6 },
  { label: "5,000", tokens: 5000, color: "#ec4899", probability: 3 },
  { label: "10,000", tokens: 10000, color: "#f59e0b", probability: 2 },
];

function pickPrize(serverIndex?: number): number {
  if (serverIndex !== undefined) return serverIndex;
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (let i = 0; i < PRIZES.length; i++) {
    cumulative += PRIZES[i].probability;
    if (rand <= cumulative) return i;
  }
  return 0;
}

interface SpinWheelProps {
  open: boolean;
  onClose: () => void;
  redemptionId?: number;
}

export function SpinWheelDialog({ open, onClose, redemptionId }: SpinWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [won, setWon] = useState<SpinPrize | null>(null);
  const [canSpin, setCanSpin] = useState(true);
  const rotationRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  const spinMutation = useMutation({
    mutationFn: (rid: number | undefined) =>
      apiRequest("POST", "/api/reward-shop/spin", { redemptionId: rid }),
    onSuccess: (data: any) => {
      const prizeIdx = data?.prizeIndex ?? pickPrize();
      animateSpin(prizeIdx);
    },
    onError: () => {
      // Still let them spin locally if server fails
      animateSpin(pickPrize());
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

      // Segment
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = prize.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + segAngle / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px system-ui";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 4;
      ctx.fillText(prize.label, R - 12, 5);
      ctx.font = "9px system-ui";
      ctx.fillText("JCMOVES", R - 12, 18);
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

    // JC text
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("JC", cx, cy + 4);
  }

  function animateSpin(prizeIdx: number) {
    setSpinning(true);
    setCanSpin(false);

    const segAngle = (2 * Math.PI) / PRIZES.length;
    // Calculate target angle so the prize lands at the top (pointer at 270deg = -PI/2)
    const targetAngle = -Math.PI / 2 - (prizeIdx * segAngle + segAngle / 2);
    const extraSpins = 5 + Math.random() * 3; // 5-8 full rotations
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
        setWon(PRIZES[prizeIdx]);
        queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
        queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reward-shop/items"] });
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }

  function handleSpin() {
    if (!canSpin || spinning) return;
    spinMutation.mutate(redemptionId);
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !spinning) onClose(); }}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden bg-gray-950 border border-yellow-500/30">
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
          <p className="text-xs text-muted-foreground mt-0.5">Spin to win JCMOVES tokens!</p>
        </div>

        <div className="px-5 py-4 flex flex-col items-center gap-4">
          {/* Pointer / triangle at top */}
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
            <canvas
              ref={canvasRef}
              width={280}
              height={280}
              className="rounded-full"
            />
          </div>

          {/* Prize display */}
          {won ? (
            <div className="w-full text-center">
              <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/10 border border-yellow-500/40 rounded-xl p-4 animate-in zoom-in-75 duration-500">
                <Trophy className="h-8 w-8 text-yellow-400 mx-auto mb-1" />
                <p className="text-sm font-bold text-yellow-300">You Won!</p>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <Coins className="h-5 w-5 text-yellow-500" />
                  <span className="text-2xl font-bold text-yellow-500">{won.label}</span>
                  <span className="text-sm text-yellow-600 font-semibold">JCMOVES</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Tokens added to your wallet!</p>
              </div>
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
                {spinning ? (
                  <><Sparkles className="h-5 w-5 mr-2 animate-spin" />Spinning…</>
                ) : (
                  <><Star className="h-5 w-5 mr-2" />Spin the Wheel!</>
                )}
              </Button>
              <div className="grid grid-cols-4 gap-1">
                {PRIZES.map((p) => (
                  <div key={p.tokens} className="text-center py-1 rounded-lg text-[10px] font-bold" style={{ backgroundColor: p.color + "33", color: p.color }}>
                    {p.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
