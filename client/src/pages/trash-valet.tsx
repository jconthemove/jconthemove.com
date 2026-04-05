import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Trash2, CheckCircle, Calendar, DollarSign, ArrowRight,
  Recycle, ShieldCheck, Clock, ChevronRight
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
      <div className="max-w-[480px] mx-auto px-4 pt-8 space-y-6">

        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-orange-500/15 flex items-center justify-center mx-auto text-4xl">
            🗑️
          </div>
          <h1 className="text-3xl font-black">Trash Valet</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Weekly curbside trash pull-out and return. Sign up once — we handle it every week.
          </p>
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5">
            <DollarSign className="h-4 w-4 text-orange-400" />
            <span className="text-orange-300 font-bold text-sm">Starting at $30/month</span>
          </div>
        </div>

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
                <Slider
                  min={1} max={10} step={1} value={[cans]}
                  onValueChange={([v]) => setCans(v)}
                  className="w-full"
                />
              </div>

              <div>
                <Label className="text-xs text-zinc-500 mb-2 block">
                  Extra bags (bags): <span className="text-white font-bold">{bagCount}</span>
                  <span className="text-zinc-600 ml-1 text-[10px]">(5 bags = 1 billable can)</span>
                </Label>
                <Slider
                  min={0} max={20} step={1} value={[bagCount]}
                  onValueChange={([v]) => setBagCount(v)}
                  className="w-full"
                />
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="recycling-toggle"
                  checked={recycling}
                  onCheckedChange={setRecycling}
                />
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

        {/* Features */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">What's included</h2>
          {[
            { icon: <CheckCircle className="h-4 w-4 text-emerald-400" />, text: "Weekly curbside pull-out and return" },
            { icon: <Calendar className="h-4 w-4 text-blue-400" />, text: "Choose your service day" },
            { icon: <Recycle className="h-4 w-4 text-green-400" />, text: "Optional bi-weekly recycling service" },
            { icon: <ShieldCheck className="h-4 w-4 text-orange-400" />, text: "One-time sign-up, weekly service" },
            { icon: <Clock className="h-4 w-4 text-purple-400" />, text: "Pause or cancel anytime" },
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
