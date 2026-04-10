import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Trash2, CheckCircle, Calendar, DollarSign, ArrowRight,
  Recycle, ShieldCheck, Clock, Gift, Phone, Globe
} from "lucide-react";

interface QuoteResult {
  billableCans: number;
  weeklyBasePrice: number;
  weeklyTrashCost: number;
  weeklyRecyclingCost: number;
  projectedMonthlyTrash: number;
  projectedMonthlyRecycling: number;
  projectedMonthlyPrice: number;
  monthlyRecyclingAdder: number;
  monthlyMinimumApplied: boolean;
  travelSurchargeMonthly: number;
  finalMonthlyPrice: number;
  planLabel: string;
}

export default function TrashValetPage() {
  const [, setLocation] = useLocation();
  const [cans, setCans] = useState(1);
  const [bagCount, setBagCount] = useState(0);
  const [recycling, setRecycling] = useState(false);

  const quoteMutation = useMutation<QuoteResult, Error, object>({
    mutationFn: (data) => apiRequest("POST", "/api/trash/quote", data).then((r) => r.json() as Promise<QuoteResult>),
  });

  const handlePreview = () => {
    quoteMutation.mutate({ cans, bagCount, recyclingEnabled: recycling, planType: "monthly" });
  };

  const quote = quoteMutation.data;

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <div className="max-w-[480px] mx-auto px-4 pt-6 space-y-6">

        {/* ── PLACARD ────────────────────────────────────────────────── */}
        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, #1c1005 0%, #2e1a06 35%, #1a0e03 65%, #0d0703 100%)",
            boxShadow: "0 0 0 1.5px rgba(255,180,0,0.18), 0 8px 40px rgba(0,0,0,0.7)",
          }}
        >
          {/* Texture overlay */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.05) 4px)`,
            }}
          />

          <div className="relative z-10 px-5 pt-6 pb-5 space-y-4">

            {/* Headline */}
            <div className="text-center space-y-1">
              <p className="text-orange-400 text-xs font-bold uppercase tracking-[0.25em]">🔥 No More</p>
              <h1
                className="text-4xl font-black leading-none tracking-tight text-white"
                style={{ textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}
              >
                TRASH DAY
              </h1>
              <h1
                className="text-4xl font-black leading-none tracking-tight"
                style={{
                  color: "#f5a623",
                  textShadow: "0 2px 16px rgba(245,166,35,0.4)",
                }}
              >
                STRESS ✅
              </h1>
              <p className="text-zinc-300 text-sm font-medium mt-2">
                We take it out. We bring it back.
              </p>
            </div>

            {/* Pricing box */}
            <div
              className="rounded-2xl px-4 py-3 space-y-1"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,180,0,0.2)" }}
            >
              <p className="text-yellow-400 text-[10px] font-black uppercase tracking-widest">Weekly Service</p>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-white leading-none">$6</span>
                <span className="text-zinc-300 text-sm font-bold">/can</span>
              </div>
              <p className="text-green-400 text-sm font-semibold">
                +$4 <span className="text-zinc-400 font-normal">recycling</span>
                <span className="text-zinc-500 text-xs ml-1">(where applicable)</span>
              </p>
              <p className="text-zinc-300 text-sm">Starting at <span className="text-white font-bold">$25/month</span></p>
            </div>

            {/* Gift a Plan */}
            <button
              onClick={() => setLocation("/trash-valet/gift")}
              className="w-full rounded-2xl px-4 py-3 text-left transition-all active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, rgba(255,180,0,0.18) 0%, rgba(255,100,0,0.12) 100%)",
                border: "1.5px solid rgba(255,180,0,0.35)",
              }}
            >
              <div className="flex items-center gap-3">
                <div className="text-3xl">🎁</div>
                <div>
                  <p className="font-black text-yellow-300 text-base leading-tight">GIFT A PLAN — SAVE 10% BOTH</p>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-green-400 text-xs flex items-center gap-1.5">
                      <CheckCircle className="h-3 w-3" /> Keep one for yourself
                    </p>
                    <p className="text-green-400 text-xs flex items-center gap-1.5">
                      <CheckCircle className="h-3 w-3" /> Gift one to a neighbor!
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-yellow-400 ml-auto flex-shrink-0" />
              </div>
            </button>

            {/* Location footer */}
            <div
              className="rounded-xl px-4 py-3 space-y-1 text-center"
              style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,180,0,0.15)" }}
            >
              <p className="text-yellow-400 font-black text-xs uppercase tracking-widest">Ironwood &amp; Surrounding Areas</p>
              <p className="text-zinc-400 text-[10px] uppercase tracking-wider">— Local Help You Can Count On —</p>
              <p className="text-zinc-400 text-[10px] uppercase tracking-wider">Custom Quotes Available</p>
              <div className="flex items-center justify-center gap-4 mt-2">
                <a href="tel:+19062859312" className="flex items-center gap-1.5 text-white text-xs font-semibold">
                  <Phone className="h-3 w-3 text-orange-400" /> (906) 285-9312
                </a>
                <a href="https://www.jconthemove.com" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-zinc-300 text-xs">
                  <Globe className="h-3 w-3 text-orange-400" /> JCOnTheMove.com
                </a>
              </div>
            </div>

            {/* Start CTA */}
            <button
              onClick={() => setLocation("/trash-valet/book")}
              className="w-full flex items-center justify-between rounded-xl px-5 py-3.5 font-black text-black active:scale-[0.98] transition-all"
              style={{
                background: "linear-gradient(90deg, #f5a623 0%, #f97316 100%)",
                boxShadow: "0 4px 20px rgba(249,115,22,0.4)",
              }}
            >
              <span className="text-base">▶ START SERVICE THIS WEEK ▶</span>
            </button>

          </div>
        </div>
        {/* ── END PLACARD ────────────────────────────────────────────── */}

        {/* How it works */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">How it works</h2>
          {[
            { icon: "1", text: "Sign up once with your address and can count" },
            { icon: "2", text: "We pull out your cans on your service day each week" },
            { icon: "3", text: "After pickup, we return cans to their spot" },
            { icon: "4", text: "Recycling weeks included if you opt in" },
          ].map((step) => (
            <div key={step.icon} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                {step.icon}
              </div>
              <p className="text-sm text-zinc-300">{step.text}</p>
            </div>
          ))}
        </div>

        {/* Live quote preview */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-5 space-y-4">
            <h2 className="text-sm font-bold text-zinc-300">Quick Price Estimate</h2>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-500 mb-2 block">
                  Number of cans: <span className="text-white font-bold">{cans}</span>
                </Label>
                <Slider min={1} max={10} step={1} value={[cans]} onValueChange={([v]) => setCans(v)} className="w-full" />
              </div>

              <div>
                <Label className="text-xs text-zinc-500 mb-2 block">
                  Extra bags: <span className="text-white font-bold">{bagCount}</span>
                  <span className="text-zinc-600 ml-1 text-[10px]">(5 bags = 1 billable can)</span>
                </Label>
                <Slider min={0} max={20} step={1} value={[bagCount]} onValueChange={([v]) => setBagCount(v)} className="w-full" />
              </div>

              <div className="flex items-center gap-3">
                <Switch id="recycling-toggle" checked={recycling} onCheckedChange={setRecycling} />
                <Label htmlFor="recycling-toggle" className="text-sm text-zinc-300 cursor-pointer flex items-center gap-1.5">
                  <Recycle className="h-4 w-4 text-green-400" />
                  Include recycling (bi-weekly · same per-can rate)
                </Label>
              </div>
            </div>

            <Button
              onClick={handlePreview}
              disabled={quoteMutation.isPending}
              className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold"
            >
              {quoteMutation.isPending ? "Calculating…" : "Get My Price"}
            </Button>

            {quote && (
              <div className="bg-zinc-800 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span className="flex items-center gap-1">🗑️ Trash — {quote.billableCans} can{quote.billableCans !== 1 ? "s" : ""} weekly</span>
                  <span className="text-white">${quote.weeklyTrashCost.toFixed(2)}/wk</span>
                </div>
                <div className="flex justify-between text-zinc-500 text-xs">
                  <span>× 52 ÷ 12 = monthly</span>
                  <span>${quote.projectedMonthlyTrash.toFixed(2)}/mo</span>
                </div>
                {recycling && (
                  <>
                    <div className="flex justify-between text-green-400 mt-1">
                      <span className="flex items-center gap-1">♻️ Recycling — {quote.billableCans} can{quote.billableCans !== 1 ? "s" : ""} bi-weekly</span>
                      <span>${quote.weeklyRecyclingCost.toFixed(2)}/event</span>
                    </div>
                    <div className="flex justify-between text-zinc-500 text-xs">
                      <span>× 26 ÷ 12 = monthly avg</span>
                      <span>${quote.projectedMonthlyRecycling.toFixed(2)}/mo</span>
                    </div>
                  </>
                )}
                {quote.monthlyMinimumApplied && (
                  <div className="flex justify-between text-yellow-400 text-xs pt-1">
                    <span>$30/month minimum applied</span>
                    <span></span>
                  </div>
                )}
                <div className="border-t border-zinc-700 pt-2 flex justify-between font-bold text-orange-400 text-base">
                  <span>Monthly estimate</span>
                  <span>${quote.finalMonthlyPrice.toFixed(2)}/mo</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gift a Plan card */}
        <button
          onClick={() => setLocation("/trash-valet/gift")}
          className="w-full rounded-2xl overflow-hidden border border-yellow-500/25 active:scale-[0.98] transition-all"
          style={{ background: "linear-gradient(135deg, #1f1500 0%, #2a1c00 100%)" }}
        >
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="text-4xl">🎁</div>
            <div className="text-left flex-1">
              <p className="font-black text-yellow-300 text-base">Gift a Plan</p>
              <p className="text-zinc-400 text-xs mt-0.5">Sign up two addresses at once — both save 10% every month</p>
              <div className="mt-2 flex gap-2">
                <span className="bg-yellow-500/20 text-yellow-300 text-[10px] font-bold px-2 py-0.5 rounded-full">10% OFF BOTH</span>
                <span className="bg-zinc-700 text-zinc-300 text-[10px] px-2 py-0.5 rounded-full">2 addresses</span>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-yellow-400 flex-shrink-0" />
          </div>
        </button>

        {/* Features */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">What's included</h2>
          {[
            { icon: <CheckCircle className="h-4 w-4 text-emerald-400" />, text: "Weekly curbside pull-out and return" },
            { icon: <Calendar className="h-4 w-4 text-blue-400" />, text: "Choose your service day" },
            { icon: <Recycle className="h-4 w-4 text-green-400" />, text: "Optional bi-weekly recycling service" },
            { icon: <ShieldCheck className="h-4 w-4 text-orange-400" />, text: "One-time sign-up, weekly service" },
            { icon: <Clock className="h-4 w-4 text-purple-400" />, text: "Pause or cancel anytime" },
            { icon: <Gift className="h-4 w-4 text-yellow-400" />, text: "Gift a plan — both addresses save 10%" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              {f.icon}
              <p className="text-sm text-zinc-300">{f.text}</p>
            </div>
          ))}
        </div>

        {/* Pricing note */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-400 space-y-1">
          <p className="text-zinc-300 font-semibold text-xs uppercase tracking-wide mb-2">Pricing Details</p>
          <p>$6 first can + $3 each additional can per service day</p>
          <p>Recycling is a separate day (bi-weekly) — same per-can rates</p>
          <p>Monthly = trash (weekly × 52÷12) + recycling (bi-weekly × 26÷12)</p>
          <p>5 bags = 1 extra billable can on trash day</p>
          <p className="text-yellow-400">$30/month minimum</p>
          <p>Travel surcharge may apply for addresses &gt;2.5 miles from base</p>
        </div>

        {/* CTA */}
        <button
          onClick={() => setLocation("/trash-valet/book")}
          className="w-full flex items-center justify-between bg-orange-500 hover:bg-orange-400 active:scale-[0.98] transition-all rounded-2xl px-5 py-4"
        >
          <div>
            <p className="text-white font-black text-lg">Start My Service</p>
            <p className="text-orange-100 text-xs">Takes about 2 minutes</p>
          </div>
          <ArrowRight className="h-6 w-6 text-white" />
        </button>

      </div>
    </div>
  );
}
