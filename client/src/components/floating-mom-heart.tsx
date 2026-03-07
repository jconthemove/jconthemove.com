import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Heart, Coins, Clock, X, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface MomStats {
  tokenBalance: number;
  totalEarned: number;
  totalHearts: number;
  totalDonated: number;
  recentDonors: { display_name: string; jcmoves_amount: number; message?: string }[];
}

interface HeartEntry {
  id: number;
  display_name: string;
  jcmoves_amount: number;
  message?: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Floating heart particles (decorative burst)
// ─────────────────────────────────────────────────────────────
interface FloatParticle { id: number; x: number; y: number; size: number; delay: number; }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250];

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export function FloatingMomHeart() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"donate" | "timeline">("donate");
  const [amount, setAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [burst, setBurst] = useState(false);
  const [floatParticles, setFloatParticles] = useState<FloatParticle[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const heartRef = useRef<HTMLButtonElement>(null);

  const { data: stats } = useQuery<MomStats>({
    queryKey: ["/api/mom/stats"],
    refetchInterval: open ? 15000 : 60000,
  });

  const { data: timeline = [] } = useQuery<HeartEntry[]>({
    queryKey: ["/api/mom/hearts"],
    enabled: tab === "timeline",
    refetchInterval: 30000,
  });

  // Gentle float animation on the button heart (every 4s)
  useEffect(() => {
    if (open) return;
    const interval = setInterval(() => {
      setFloatParticles(
        Array.from({ length: 4 }, (_, i) => ({
          id: Date.now() + i,
          x: Math.random() * 40 - 20,
          y: -(20 + Math.random() * 30),
          size: 8 + Math.random() * 8,
          delay: i * 0.15,
        }))
      );
      setTimeout(() => setFloatParticles([]), 1500);
    }, 4000);
    return () => clearInterval(interval);
  }, [open]);

  const donateMutation = useMutation({
    mutationFn: (payload: { amount: number; message: string; displayName: string }) =>
      apiRequest("POST", "/api/mom/hearts", payload),
    onSuccess: () => {
      setBurst(true);
      setTimeout(() => setBurst(false), 1000);
      setMessage("");
      setCustomAmount("");
      setAmount(10);
      qc.invalidateQueries({ queryKey: ["/api/mom/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/mom/hearts"] });
      qc.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      qc.invalidateQueries({ queryKey: ["/api/mining/status"] });
      toast({
        title: "❤️ Love sent!",
        description: `${finalAmount} JCMOVES delivered to Nicolasa with love.`,
      });
      setTab("timeline");
    },
    onError: (err: any) => {
      toast({ title: "Couldn't send love", description: err?.message, variant: "destructive" });
    },
  });

  const finalAmount = customAmount ? parseInt(customAmount) || 0 : amount;

  function handleSend() {
    if (!user) {
      toast({ title: "Sign in to send love", description: "Log in to donate JCMOVES to Mom", variant: "destructive" });
      return;
    }
    if (finalAmount < 1) {
      toast({ title: "Enter an amount", description: "Minimum is 1 JCMOVES", variant: "destructive" });
      return;
    }
    donateMutation.mutate({
      amount: finalAmount,
      message: message.trim(),
      displayName: displayName.trim(),
    });
  }

  // Only visible to signed-in customers and employees
  const allowedRoles = ["customer", "employee", "admin", "business_owner"];
  if (!user || !allowedRoles.includes(user.role)) return null;

  return (
    <>
      {/* ── Floating button ── */}
      <div className="fixed bottom-24 left-4 z-50 flex flex-col items-center pointer-events-none">
        {/* Burst particles */}
        {floatParticles.map(p => (
          <div
            key={p.id}
            className="absolute pointer-events-none select-none text-pink-400 opacity-0"
            style={{
              fontSize: p.size,
              left: "50%",
              bottom: "50%",
              animation: `heartFloat 1.4s ease-out ${p.delay}s forwards`,
              transform: `translate(${p.x}px, 0)`,
            }}
          >
            ❤️
          </div>
        ))}
        <button
          ref={heartRef}
          className={`pointer-events-auto w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 active:scale-90 hover:scale-110 select-none
            ${burst ? "scale-125 bg-pink-500" : "bg-gradient-to-br from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500"}`}
          style={{
            boxShadow: burst
              ? "0 0 30px 15px rgba(236,72,153,0.6)"
              : "0 0 16px 4px rgba(236,72,153,0.4), 0 4px 20px rgba(0,0,0,0.4)",
          }}
          onClick={() => setOpen(true)}
          title="I Love You Mom ❤️"
        >
          <span className="text-2xl leading-none" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>❤️</span>
        </button>
        {stats && stats.totalHearts > 0 && (
          <div className="pointer-events-none mt-1 bg-pink-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
            {stats.totalHearts}
          </div>
        )}
      </div>

      {/* ── Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-gray-950 border border-pink-500/20 max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div
            className="relative px-5 pt-5 pb-4 border-b border-pink-500/20"
            style={{
              background: "linear-gradient(135deg, #1a0014 0%, #0d0010 50%, #1a0014 100%)",
            }}
          >
            <div className="absolute inset-0 opacity-20"
              style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(236,72,153,0.5), transparent 60%)" }} />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xl">❤️</span>
                  <h2 className="font-black text-base text-white">I Love You Mom</h2>
                </div>
                <p className="text-xs text-pink-300/70 italic">Send JCMOVES love to Nicolasa Jackson</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mom's stats */}
            {stats && (
              <div className="relative mt-3 grid grid-cols-3 gap-2">
                <div className="bg-pink-950/60 border border-pink-500/20 rounded-xl px-2 py-2 text-center">
                  <div className="text-xs font-black text-pink-300 tabular-nums">
                    {Math.round(stats.tokenBalance).toLocaleString()}
                  </div>
                  <div className="text-[9px] text-pink-600 font-bold uppercase tracking-wider">Balance</div>
                </div>
                <div className="bg-pink-950/60 border border-pink-500/20 rounded-xl px-2 py-2 text-center">
                  <div className="text-xs font-black text-pink-300 tabular-nums">
                    {stats.totalHearts.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-pink-600 font-bold uppercase tracking-wider">Hearts</div>
                </div>
                <div className="bg-pink-950/60 border border-pink-500/20 rounded-xl px-2 py-2 text-center">
                  <div className="text-xs font-black text-pink-300 tabular-nums">
                    {Math.round(stats.totalDonated).toLocaleString()}
                  </div>
                  <div className="text-[9px] text-pink-600 font-bold uppercase tracking-wider">Donated</div>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${tab === "donate" ? "text-pink-400 border-b-2 border-pink-500" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setTab("donate")}
            >
              ❤️ Send Love
            </button>
            <button
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${tab === "timeline" ? "text-pink-400 border-b-2 border-pink-500" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setTab("timeline")}
            >
              💌 Timeline
            </button>
          </div>

          <div className="px-5 py-4">
            {tab === "donate" ? (
              <div className="space-y-4">
                {/* 1% auto-note */}
                <div className="flex items-start gap-2 bg-pink-950/30 border border-pink-500/15 rounded-xl px-3 py-2.5">
                  <Coins className="h-3.5 w-3.5 text-pink-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-pink-300/80">
                    Nicolasa automatically receives <strong>1% of every JCMOVES transaction</strong> across the entire platform — yours is a direct bonus on top of that.
                  </p>
                </div>

                {/* Quick amount grid */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Choose Amount</label>
                  <div className="grid grid-cols-3 gap-2">
                    {QUICK_AMOUNTS.map(a => (
                      <button
                        key={a}
                        onClick={() => { setAmount(a); setCustomAmount(""); }}
                        className={`rounded-xl py-2 text-sm font-bold transition-all border ${
                          finalAmount === a && !customAmount
                            ? "bg-pink-500 border-pink-500 text-white shadow-lg shadow-pink-500/30"
                            : "bg-card border-border text-muted-foreground hover:border-pink-500/50 hover:text-pink-400"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 relative">
                    <Input
                      type="number"
                      placeholder="Custom amount..."
                      value={customAmount}
                      onChange={e => setCustomAmount(e.target.value)}
                      className="bg-card border-border text-sm h-9 pr-20"
                      min={1}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">JCMOVES</span>
                  </div>
                </div>

                {/* Display name */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Your Name (optional)</label>
                  <Input
                    placeholder="How should Mom see your name?"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="bg-card border-border text-sm h-9"
                    maxLength={50}
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Message for Mom ❤️</label>
                  <Textarea
                    placeholder="I love you because..."
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className="bg-card border-border text-sm resize-none"
                    rows={3}
                    maxLength={280}
                  />
                  <p className="text-[10px] text-muted-foreground/50 mt-1 text-right">{message.length}/280</p>
                </div>

                {/* Send button */}
                <Button
                  className="w-full h-12 font-black text-white"
                  style={{
                    background: "linear-gradient(135deg, #ec4899, #f43f5e)",
                    boxShadow: "0 0 20px rgba(236,72,153,0.4)",
                  }}
                  onClick={handleSend}
                  disabled={donateMutation.isPending || finalAmount < 1}
                >
                  {donateMutation.isPending ? (
                    <><Heart className="h-5 w-5 mr-2 animate-pulse" /> Sending love...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> Send {finalAmount || "?"} JCMOVES Love</>
                  )}
                </Button>

                {!user && (
                  <p className="text-xs text-center text-muted-foreground">
                    You need to be signed in to donate.
                  </p>
                )}
              </div>
            ) : (
              /* Timeline */
              <div className="space-y-3">
                {timeline.length === 0 ? (
                  <div className="text-center py-10">
                    <div className="text-4xl mb-2">❤️</div>
                    <p className="text-sm text-muted-foreground">No hearts yet — be the first!</p>
                  </div>
                ) : (
                  timeline.map(entry => (
                    <div
                      key={entry.id}
                      className="bg-card/60 border border-pink-500/10 rounded-2xl px-4 py-3 hover:border-pink-500/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl select-none">❤️</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-pink-300">{entry.display_name}</span>
                              <Badge className="bg-pink-500/15 text-pink-400 border-pink-500/20 text-[10px] py-0 font-bold">
                                <Coins className="h-2.5 w-2.5 mr-1" />
                                {entry.jcmoves_amount.toLocaleString()} JCMOVES
                              </Badge>
                            </div>
                            {entry.message && (
                              <p className="text-xs text-muted-foreground mt-1 italic">"{entry.message}"</p>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground/50 shrink-0 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {timeAgo(entry.created_at)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Keyframe CSS */}
      <style>{`
        @keyframes heartFloat {
          0%   { opacity: 1; transform: translate(var(--hx, 0px), 0); }
          100% { opacity: 0; transform: translate(var(--hx, 0px), -50px) scale(0.5); }
        }
      `}</style>
    </>
  );
}
