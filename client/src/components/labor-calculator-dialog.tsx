import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Users, Clock, Coins, DollarSign, Calculator, CheckCircle2,
  CalendarDays, ArrowRight, ChevronDown, ChevronUp, Info, Zap
} from "lucide-react";

const TOKENS_PER_MOVER_MINUTE = 500;
const CASH_PER_MOVER_HOUR = 62.5;
const SERVICE_MIN_CASH = 50;
const SERVICE_MIN_TOKENS = 15000;

const DURATION_PRESETS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "2 hr", value: 120 },
  { label: "3 hr", value: 180 },
  { label: "4 hr", value: 240 },
  { label: "5 hr", value: 300 },
  { label: "6 hr", value: 360 },
  { label: "7 hr", value: 420 },
  { label: "8 hr", value: 480 },
];

const SERVICE_TYPES = [
  { value: "moving", label: "Moving Help", icon: "🏠" },
  { value: "loading", label: "Loading / Unloading", icon: "📦" },
  { value: "furniture", label: "Furniture Rearranging", icon: "🛋️" },
  { value: "junk", label: "Junk Removal Labor", icon: "🗑️" },
];

function calcQuote(movers: number, minutes: number) {
  const moverMinutes = movers * minutes;
  const rawTokens = moverMinutes * TOKENS_PER_MOVER_MINUTE;
  const rawCash = (movers * minutes * CASH_PER_MOVER_HOUR) / 60;

  const tokenPrice = Math.max(rawTokens, SERVICE_MIN_TOKENS);
  const cashPrice = Math.max(rawCash, SERVICE_MIN_CASH);

  let tokenCoverageRatio = 1.0;
  if (minutes >= 120) tokenCoverageRatio = 0.5;
  else if (minutes >= 60) tokenCoverageRatio = 0.75;

  const tokenCap = Math.floor(tokenPrice * tokenCoverageRatio);
  return { moverMinutes, tokenPrice, cashPrice, tokenCap, tokenCoverageRatio };
}

function fmt(n: number) {
  return n.toLocaleString();
}

interface Props {
  open: boolean;
  onClose: () => void;
  walletBalance: number;
}

export function LaborCalculatorDialog({ open, onClose, walletBalance }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [movers, setMovers] = useState(2);
  const [minutes, setMinutes] = useState(60);
  const [customMinutes, setCustomMinutes] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [serviceType, setServiceType] = useState("moving");
  const [paymentMode, setPaymentMode] = useState<"tokens" | "split" | "cash">("tokens");
  const [tokenApplied, setTokenApplied] = useState(0);
  const [scheduledDate, setScheduledDate] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [submitted, setSubmitted] = useState<{ leadId: string | null; cashDueCents: number; tokenApplied: number } | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const effectiveMinutes = useCustom
    ? (parseInt(customMinutes) || 15)
    : minutes;

  const quote = useMemo(() => calcQuote(movers, effectiveMinutes), [movers, effectiveMinutes]);

  const canAffordAll = walletBalance >= quote.tokenPrice;
  const canAffordCap = walletBalance >= quote.tokenCap;

  const effectiveTokenApplied = useMemo(() => {
    if (paymentMode === "tokens") return Math.min(quote.tokenPrice, walletBalance);
    if (paymentMode === "cash") return 0;
    return Math.min(tokenApplied, quote.tokenCap, Math.floor(walletBalance));
  }, [paymentMode, tokenApplied, quote, walletBalance]);

  const tokenValueDollars = (effectiveTokenApplied / quote.tokenPrice) * quote.cashPrice;
  const cashDue = Math.max(0, quote.cashPrice - tokenValueDollars);

  const submitMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/labor-quote/submit", {
        movers,
        minutes: effectiveMinutes,
        serviceType,
        paymentMode,
        tokenApplied: effectiveTokenApplied,
        userNotes: userNotes || undefined,
        scheduledDate: scheduledDate || undefined,
      }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/labor-quote/my-quotes"] });
      setSubmitted({ leadId: data.leadId, cashDueCents: data.cashDueCents, tokenApplied: data.tokenApplied });
      toast({ title: "🧮 Labor Quote Submitted!", description: "Your booking is in the pipeline. We'll confirm shortly." });
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  function resetAndClose() {
    setSubmitted(null);
    setMovers(2);
    setMinutes(60);
    setCustomMinutes("");
    setUseCustom(false);
    setServiceType("moving");
    setPaymentMode("tokens");
    setTokenApplied(0);
    setScheduledDate("");
    setUserNotes("");
    setShowBreakdown(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="max-w-xl w-full max-h-[90vh] overflow-y-auto p-0 bg-card border border-border">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Calculator className="h-5 w-5 text-orange-400" />
            Labor Calculator
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Build your crew and convert JCMOVES to real moving labor</p>
        </DialogHeader>

        {submitted ? (
          /* ── Success State ── */
          <div className="px-6 py-8 text-center flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
            <h3 className="text-xl font-bold">Booking Submitted!</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Your labor request is in our pipeline.
              {submitted.tokenApplied > 0 && (
                <> <strong className="text-yellow-500">{fmt(submitted.tokenApplied)} JCMOVES</strong> have been applied.</>
              )}
              {submitted.cashDueCents > 0 && (
                <> <strong className="text-foreground"> ${(submitted.cashDueCents / 100).toFixed(2)} cash</strong> will be due at service.</>
              )}
              {submitted.cashDueCents === 0 && submitted.tokenApplied > 0 && " Fully covered by tokens!"}
            </p>
            {submitted.leadId && (
              <a
                href={`/lead/${submitted.leadId}`}
                className="inline-flex items-center gap-2 bg-orange-500 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-orange-600 transition-colors"
              >
                View Booking <ArrowRight className="h-4 w-4" />
              </a>
            )}
            <Button variant="outline" size="sm" onClick={resetAndClose}>Close</Button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-6">
            {/* ── Movers ── */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="h-4 w-4 text-orange-400" />
                <span className="text-sm font-semibold">Number of Movers</span>
              </div>
              <div className="flex gap-2">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMovers(n)}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                      movers === n
                        ? "bg-orange-500 border-orange-500 text-white shadow-md"
                        : "border-border bg-background text-foreground hover:border-orange-400"
                    }`}
                  >
                    {n} Movers
                    {n === 2 && <div className="text-[10px] font-normal opacity-70">Standard</div>}
                    {n === 3 && <div className="text-[10px] font-normal opacity-70">Large Load</div>}
                    {n === 4 && <div className="text-[10px] font-normal opacity-70">Heavy Job</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Duration ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-orange-400" />
                  <span className="text-sm font-semibold">Duration</span>
                </div>
                <button
                  onClick={() => { setUseCustom(!useCustom); setCustomMinutes(""); }}
                  className="text-xs text-orange-400 hover:text-orange-300 underline"
                >
                  {useCustom ? "Use preset" : "Custom minutes"}
                </button>
              </div>
              {useCustom ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="e.g. 75"
                    min={15}
                    step={15}
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">min (15 min min.)</span>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-1.5">
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setMinutes(p.value)}
                      className={`py-2 rounded-lg border text-xs font-semibold transition-all ${
                        minutes === p.value
                          ? "bg-orange-500 border-orange-500 text-white"
                          : "border-border bg-background text-foreground hover:border-orange-400"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Service Type ── */}
            <div>
              <p className="text-sm font-semibold mb-2">Service Type</p>
              <div className="grid grid-cols-2 gap-2">
                {SERVICE_TYPES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setServiceType(s.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all text-left ${
                      serviceType === s.value
                        ? "bg-orange-500/15 border-orange-500/50 text-orange-400"
                        : "border-border bg-background text-foreground hover:border-orange-400/50"
                    }`}
                  >
                    <span className="text-base">{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Live Quote Card ── */}
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">Your Quote</span>
                <span className="text-xs text-muted-foreground">{movers} movers × {effectiveMinutes} min = {fmt(quote.moverMinutes)} mover-min</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background/60 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Coins className="h-3.5 w-3.5 text-yellow-500" />
                    <span className="text-xs text-muted-foreground">Full Token Price</span>
                  </div>
                  <p className="text-lg font-bold text-yellow-500">{fmt(quote.tokenPrice)}</p>
                  <p className="text-[10px] text-muted-foreground">JCMOVES</p>
                </div>
                <div className="bg-background/60 rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <DollarSign className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-xs text-muted-foreground">Cash Price</span>
                  </div>
                  <p className="text-lg font-bold text-green-400">${quote.cashPrice.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground">USD</p>
                </div>
              </div>

              {quote.tokenCoverageRatio < 1 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3 w-3 shrink-0" />
                  <span>Longer jobs: max token coverage is {Math.round(quote.tokenCoverageRatio * 100)}% ({fmt(quote.tokenCap)} JCMOVES cap)</span>
                </div>
              )}

              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="text-xs text-orange-400 flex items-center gap-1 hover:text-orange-300"
              >
                {showBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showBreakdown ? "Hide" : "Show"} price breakdown
              </button>

              {showBreakdown && (
                <div className="text-xs space-y-1 text-muted-foreground border-t border-border/50 pt-2">
                  <p>Rate: {movers} movers × ${CASH_PER_MOVER_HOUR}/hr = ${(movers * CASH_PER_MOVER_HOUR).toFixed(2)}/hr total</p>
                  <p>Duration: {effectiveMinutes} min = {(effectiveMinutes / 60).toFixed(2)} hrs</p>
                  <p>Token rate: {fmt(TOKENS_PER_MOVER_MINUTE)} JCMOVES / mover-minute</p>
                  {quote.cashPrice === SERVICE_MIN_CASH && <p className="text-orange-400">* Minimum service fee applied (${SERVICE_MIN_CASH})</p>}
                  {quote.tokenPrice === SERVICE_MIN_TOKENS && <p className="text-orange-400">* Minimum token floor applied ({fmt(SERVICE_MIN_TOKENS)} JCMOVES)</p>}
                </div>
              )}
            </div>

            {/* ── Payment Mode ── */}
            <div>
              <p className="text-sm font-semibold mb-2">Payment Method</p>
              <div className="flex gap-2">
                {(["tokens", "split", "cash"] as const).map((mode) => {
                  const labels: Record<string, string> = { tokens: "All JCMOVES", split: "Split Pay", cash: "Cash Only" };
                  const icons: Record<string, string> = { tokens: "🪙", split: "⚡", cash: "💵" };
                  const disabled = mode === "tokens" && !canAffordAll;
                  return (
                    <button
                      key={mode}
                      onClick={() => { if (!disabled) setPaymentMode(mode); }}
                      disabled={disabled}
                      className={`flex-1 py-2.5 px-2 rounded-lg border text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                        paymentMode === mode
                          ? "bg-orange-500 border-orange-500 text-white"
                          : disabled
                          ? "opacity-40 cursor-not-allowed border-border bg-background"
                          : "border-border bg-background hover:border-orange-400"
                      }`}
                    >
                      <span>{icons[mode]}</span>
                      {labels[mode]}
                      {mode === "tokens" && disabled && <span className="text-[9px] opacity-70">Need {fmt(quote.tokenPrice - Math.floor(walletBalance))} more</span>}
                    </button>
                  );
                })}
              </div>

              {/* Token slider for split mode */}
              {paymentMode === "split" && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Tokens to Apply</span>
                    <span className="font-bold text-yellow-500">{fmt(effectiveTokenApplied)} JCMOVES</span>
                  </div>
                  <Slider
                    min={0}
                    max={Math.min(quote.tokenCap, Math.floor(walletBalance))}
                    step={500}
                    value={[tokenApplied]}
                    onValueChange={([v]) => setTokenApplied(v)}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0</span>
                    <span>Cap: {fmt(Math.min(quote.tokenCap, Math.floor(walletBalance)))}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Tokens Applied</p>
                      <p className="text-sm font-bold text-yellow-500">{fmt(effectiveTokenApplied)}</p>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Cash Due at Service</p>
                      <p className="text-sm font-bold text-green-400">${cashDue.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary line */}
              {paymentMode === "tokens" && (
                <div className="mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
                  <p className="text-xs">
                    <strong className="text-yellow-500">{fmt(effectiveTokenApplied)} JCMOVES</strong> will be deducted. Cash due at service: <strong className="text-green-400">$0.00</strong>
                  </p>
                </div>
              )}
              {paymentMode === "cash" && (
                <div className="mt-3 bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-400 shrink-0" />
                  <p className="text-xs">Full <strong className="text-green-400">${quote.cashPrice.toFixed(2)}</strong> cash due at service. No tokens deducted.</p>
                </div>
              )}
            </div>

            {/* ── Scheduling ── */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CalendarDays className="h-4 w-4 text-orange-400" />
                <span className="text-sm font-semibold">Preferred Date <span className="text-muted-foreground font-normal">(optional)</span></span>
              </div>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="h-9 text-sm"
              />
            </div>

            {/* ── Notes ── */}
            <div>
              <p className="text-sm font-semibold mb-2">Notes <span className="text-muted-foreground font-normal">(optional)</span></p>
              <Textarea
                placeholder="Anything we should know? Stairs, elevator, distance, large items..."
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            {/* ── Wallet Status ── */}
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-background/50 rounded-lg px-3 py-2 border border-border">
              <span className="flex items-center gap-1"><Coins className="h-3 w-3 text-yellow-500" /> Your Balance</span>
              <span className="font-bold text-yellow-500">{fmt(Math.floor(walletBalance))} JCMOVES</span>
            </div>

            {/* ── Submit ── */}
            <div className="flex gap-2 pb-1">
              <Button variant="outline" onClick={resetAndClose} className="flex-1">Cancel</Button>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || (paymentMode !== "cash" && effectiveTokenApplied > walletBalance)}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold"
              >
                {submitMutation.isPending ? (
                  "Submitting..."
                ) : (
                  <>
                    <Calculator className="h-4 w-4 mr-1.5" />
                    Book {movers} Movers × {effectiveMinutes} min
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Embeddable version (no Dialog wrapper, fetches its own wallet balance) ──
export function LaborCalculatorEmbedded() {
  const { data: walletData } = useQuery<{ tokenBalance: string }>({
    queryKey: ["/api/rewards/wallet"],
  });
  const walletBalance = parseFloat(walletData?.tokenBalance || "0");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [movers, setMovers] = useState(2);
  const [minutes, setMinutes] = useState(60);
  const [customMinutes, setCustomMinutes] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [serviceType, setServiceType] = useState("moving");
  const [paymentMode, setPaymentMode] = useState<"tokens" | "split" | "cash">("tokens");
  const [tokenApplied, setTokenApplied] = useState(0);
  const [scheduledDate, setScheduledDate] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [submitted, setSubmitted] = useState<{ leadId: string | null; cashDueCents: number; tokenApplied: number } | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const effectiveMinutes = useCustom ? (parseInt(customMinutes) || 15) : minutes;
  const quote = useMemo(() => calcQuote(movers, effectiveMinutes), [movers, effectiveMinutes]);
  const canAffordAll = walletBalance >= quote.tokenPrice;

  const effectiveTokenApplied = useMemo(() => {
    if (paymentMode === "tokens") return Math.min(quote.tokenPrice, walletBalance);
    if (paymentMode === "cash") return 0;
    return Math.min(tokenApplied, quote.tokenCap, Math.floor(walletBalance));
  }, [paymentMode, tokenApplied, quote, walletBalance]);

  const tokenValueDollars = (effectiveTokenApplied / quote.tokenPrice) * quote.cashPrice;
  const cashDue = Math.max(0, quote.cashPrice - tokenValueDollars);

  const submitMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/labor-quote/submit", {
        movers, minutes: effectiveMinutes, serviceType, paymentMode,
        tokenApplied: effectiveTokenApplied,
        userNotes: userNotes || undefined, scheduledDate: scheduledDate || undefined,
      }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/rewards/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mining/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/labor-quote/my-quotes"] });
      setSubmitted({ leadId: data.leadId, cashDueCents: data.cashDueCents, tokenApplied: data.tokenApplied });
      toast({ title: "🧮 Labor Quote Submitted!", description: "Your booking is in the pipeline. We'll confirm shortly." });
    },
    onError: (err: any) => {
      toast({ title: "Submission failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  if (submitted) {
    return (
      <div className="py-6 text-center flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle2 className="h-7 w-7 text-green-400" />
        </div>
        <h3 className="text-lg font-bold">Booking Submitted!</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Your labor request is in our pipeline.
          {submitted.tokenApplied > 0 && <> <strong className="text-yellow-500">{fmt(submitted.tokenApplied)} JCMOVES</strong> applied.</>}
          {submitted.cashDueCents > 0 && <> <strong>${(submitted.cashDueCents / 100).toFixed(2)}</strong> cash due at service.</>}
        </p>
        {submitted.leadId && (
          <a href={`/lead/${submitted.leadId}`} className="inline-flex items-center gap-2 bg-orange-500 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-orange-600 transition-colors">
            View Booking <ArrowRight className="h-4 w-4" />
          </a>
        )}
        <Button variant="outline" size="sm" onClick={() => setSubmitted(null)}>Calculate Another</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-y-auto">
      {/* Movers */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Users className="h-4 w-4 text-orange-400" />
          <span className="text-sm font-semibold">Number of Movers</span>
        </div>
        <div className="flex gap-2">
          {[2, 3, 4].map((n) => (
            <button key={n} onClick={() => setMovers(n)}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all ${movers === n ? "bg-orange-500 border-orange-500 text-white" : "border-border bg-background text-foreground hover:border-orange-400"}`}>
              {n} Movers
              <div className="text-[10px] font-normal opacity-70">{n === 2 ? "Standard" : n === 3 ? "Large Load" : "Heavy Job"}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-semibold">Duration</span>
          </div>
          <button onClick={() => { setUseCustom(!useCustom); setCustomMinutes(""); }} className="text-xs text-orange-400 hover:text-orange-300 underline">
            {useCustom ? "Use preset" : "Custom minutes"}
          </button>
        </div>
        {useCustom ? (
          <div className="flex items-center gap-2">
            <input type="number" placeholder="e.g. 75" min={15} step={15} value={customMinutes} onChange={(e) => setCustomMinutes(e.target.value)}
              className="h-9 text-sm flex-1 rounded-md border border-border bg-background px-3" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">min</span>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-1.5">
            {DURATION_PRESETS.map((p) => (
              <button key={p.value} onClick={() => setMinutes(p.value)}
                className={`py-2 rounded-lg border text-xs font-semibold transition-all ${minutes === p.value ? "bg-orange-500 border-orange-500 text-white" : "border-border bg-background text-foreground hover:border-orange-400"}`}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Service Type */}
      <div>
        <p className="text-sm font-semibold mb-2">Service Type</p>
        <div className="grid grid-cols-2 gap-2">
          {SERVICE_TYPES.map((s) => (
            <button key={s.value} onClick={() => setServiceType(s.value)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all text-left ${serviceType === s.value ? "bg-orange-500/15 border-orange-500/50 text-orange-400" : "border-border bg-background text-foreground hover:border-orange-400/50"}`}>
              <span className="text-base">{s.icon}</span>{s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Quote */}
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">Your Quote</span>
          <span className="text-xs text-muted-foreground">{movers} × {effectiveMinutes} min</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-background/60 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Coins className="h-3.5 w-3.5 text-yellow-500" />
              <span className="text-xs text-muted-foreground">Token Price</span>
            </div>
            <p className="text-lg font-bold text-yellow-500">{fmt(quote.tokenPrice)}</p>
            <p className="text-[10px] text-muted-foreground">JCMOVES</p>
          </div>
          <div className="bg-background/60 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs text-muted-foreground">Cash Price</span>
            </div>
            <p className="text-lg font-bold text-green-400">${quote.cashPrice.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">USD</p>
          </div>
        </div>
      </div>

      {/* Payment Mode */}
      <div>
        <p className="text-sm font-semibold mb-2">Payment Method</p>
        <div className="flex gap-2">
          {(["tokens", "split", "cash"] as const).map((mode) => {
            const labels: Record<string, string> = { tokens: "All JCMOVES", split: "Split Pay", cash: "Cash Only" };
            const icons: Record<string, string> = { tokens: "🪙", split: "⚡", cash: "💵" };
            const disabled = mode === "tokens" && !canAffordAll;
            return (
              <button key={mode} onClick={() => { if (!disabled) setPaymentMode(mode); }} disabled={disabled}
                className={`flex-1 py-2.5 px-2 rounded-lg border text-xs font-semibold transition-all flex flex-col items-center gap-1 ${paymentMode === mode ? "bg-orange-500 border-orange-500 text-white" : disabled ? "opacity-40 cursor-not-allowed border-border bg-background" : "border-border bg-background hover:border-orange-400"}`}>
                <span>{icons[mode]}</span>{labels[mode]}
              </button>
            );
          })}
        </div>
        {paymentMode === "split" && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Tokens to Apply</span>
              <span className="font-bold text-yellow-500">{fmt(effectiveTokenApplied)} JCMOVES</span>
            </div>
            <Slider min={0} max={Math.min(quote.tokenCap, Math.floor(walletBalance))} step={500} value={[tokenApplied]} onValueChange={([v]) => setTokenApplied(v)} className="w-full" />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Tokens Applied</p>
                <p className="text-sm font-bold text-yellow-500">{fmt(effectiveTokenApplied)}</p>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2.5 text-center">
                <p className="text-[10px] text-muted-foreground mb-0.5">Cash Due</p>
                <p className="text-sm font-bold text-green-400">${cashDue.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Schedule + Notes */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold mb-1.5 flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-orange-400" /> Preferred Date</p>
          <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} min={new Date().toISOString().split("T")[0]}
            className="h-9 text-sm w-full rounded-md border border-border bg-background px-3" />
        </div>
        <div className="flex items-end text-xs text-muted-foreground bg-background/50 rounded-lg px-3 py-2 border border-border self-end">
          <span className="flex items-center gap-1 w-full justify-between">
            <span className="flex items-center gap-1"><Coins className="h-3 w-3 text-yellow-500" /> Balance</span>
            <span className="font-bold text-yellow-500">{fmt(Math.floor(walletBalance))}</span>
          </span>
        </div>
      </div>
      <Textarea placeholder="Anything we should know? Stairs, elevator, large items..." value={userNotes} onChange={(e) => setUserNotes(e.target.value)} rows={2} className="text-sm resize-none" />

      {/* Submit */}
      <Button onClick={() => submitMutation.mutate()}
        disabled={submitMutation.isPending || (paymentMode !== "cash" && effectiveTokenApplied > walletBalance)}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold">
        {submitMutation.isPending ? "Submitting..." : <><Calculator className="h-4 w-4 mr-1.5" />Book {movers} Movers × {effectiveMinutes} min</>}
      </Button>
    </div>
  );
}
