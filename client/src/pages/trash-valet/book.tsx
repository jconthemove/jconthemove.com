import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, CheckCircle2, Recycle, DollarSign, Trash2 } from "lucide-react";
import BookingConfirmedTiles from "@/components/BookingConfirmedTiles";
import { DatePicker } from "@/components/ui/date-picker";
import { calculateTrashValetQuote, type TrashValetQuote } from "@shared/trashValetPricing";

const DAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const PLAN_OPTIONS = [
  { value: "monthly", label: "Monthly billing (default)" },
  { value: "yearly", label: "Yearly (11 months charged, 12 months service)" },
];

interface BookingResult {
  subscriptionId: string;
  jobId: string;
  quote: { finalMonthlyPrice: number };
  promoApplied?: boolean;
}

export default function TrashValetBookPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [subId, setSubId] = useState("");
  const [serverMonthlyPrice, setServerMonthlyPrice] = useState<number | null>(null);

  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "MI",
    zip: "",
    cans: 1,
    bagCount: 0,
    recyclingEnabled: false,
    recyclingAnchorDate: "",
    serviceDayOfWeek: "1",
    recyclingDayOfWeek: "1",
    serviceNotes: "",
    planType: "monthly",
    promoCode: "",
  });

  const setField = (key: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const quote = calculateTrashValetQuote({
    cans: Number(form.cans) || 0,
    bagCount: Number(form.bagCount) || 0,
    recyclingEnabled: form.recyclingEnabled,
    recyclingAnchorDate: form.recyclingAnchorDate || null,
    planType: form.planType as "monthly" | "yearly",
  });

  const bookMutation = useMutation<BookingResult, Error, object>({
    mutationFn: (data) =>
      apiRequest("POST", "/api/trash/subscribe", data).then((r) => r.json() as Promise<BookingResult>),
    onSuccess: (data) => {
      setSubId(data.subscriptionId);
      setServerMonthlyPrice(data.quote?.finalMonthlyPrice ?? null);
      setSubmitted(true);
    },
    onError: (err) => {
      toast({ title: "Booking failed", description: err.message || "Something went wrong", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName.trim() || !form.phone.trim() || !form.address.trim()) {
      toast({ title: "Required fields missing", description: "Name, phone, and address are required.", variant: "destructive" });
      return;
    }
    bookMutation.mutate({
      ...form,
      cans: Number(form.cans),
      bagCount: Number(form.bagCount),
      serviceDayOfWeek: Number(form.serviceDayOfWeek),
      recyclingDayOfWeek: form.recyclingEnabled ? Number(form.recyclingDayOfWeek) : null,
    });
  };

  if (submitted) {
    const trashDay = DAY_OPTIONS.find(d => d.value === form.serviceDayOfWeek)?.label ?? form.serviceDayOfWeek;
    const recyclingDay = DAY_OPTIONS.find(d => d.value === form.recyclingDayOfWeek)?.label ?? form.recyclingDayOfWeek;
    const monthlyPrice = (serverMonthlyPrice ?? quote.finalMonthlyPrice).toFixed(2);
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-start px-4 pt-12 pb-16">
        <div className="max-w-sm w-full space-y-0 rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-900/20 via-zinc-900/80 to-zinc-950 overflow-hidden">

          {/* Hero bar */}
          <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <p className="font-extrabold text-white text-base leading-tight">Subscription Confirmed!</p>
              <p className="text-xs text-green-300 mt-0.5">We'll reach out to finalize your first pickup date.</p>
            </div>
          </div>

          <div className="px-4 py-4 space-y-3">

            {/* Plan summary */}
            <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/50 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Your Plan</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Monthly rate</span>
                  <span className="font-bold text-orange-400">${monthlyPrice}/mo</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Trash day</span>
                  <span className="text-white">{trashDay}s</span>
                </div>
                {form.recyclingEnabled && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Recycling day</span>
                    <span className="text-green-400">{recyclingDay}s (bi-weekly)</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Plan type</span>
                  <span className="text-white capitalize">{form.planType}</span>
                </div>
              </div>
            </div>

            {/* What happens next */}
            <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/40 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2.5">What Happens Next</p>
              <div className="space-y-2">
                {[
                  "We contact you to confirm your first pickup and set up billing",
                  "Cans go out the night before your service day — we bring them back after",
                  "You'll receive a Square invoice monthly — pay to keep service active ✅",
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-xs text-zinc-300 leading-snug">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 text-center">
              Questions? Call <a href="tel:+19062859312" className="text-zinc-300 underline">(906) 285-9312</a>
            </p>

            <Button onClick={() => setLocation("/")} className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold">
              Back to Home
            </Button>

            <BookingConfirmedTiles />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <div className="max-w-[480px] mx-auto px-4 pt-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/trash-valet")}
            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4 text-zinc-400" />
          </button>
          <div>
            <h1 className="text-xl font-black">Book Trash Valet</h1>
            <p className="text-zinc-500 text-xs">Weekly curbside service — we bring them out &amp; back</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Customer info */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-zinc-300">Your Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-500">Full Name *</Label>
                <Input
                  value={form.customerName}
                  onChange={(e) => setField("customerName", e.target.value)}
                  placeholder="Jane Smith"
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Phone *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="(906) 555-0123"
                  type="tel"
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Email</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="jane@example.com"
                  type="email"
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-zinc-300">Service Address *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                placeholder="123 Main St"
                className="bg-zinc-800 border-zinc-700 text-white"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  placeholder="City"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
                <Input
                  value={form.zip}
                  onChange={(e) => setField("zip", e.target.value)}
                  placeholder="ZIP"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  maxLength={5}
                />
              </div>
              <Input
                value={form.state}
                onChange={(e) => setField("state", e.target.value)}
                placeholder="State"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </CardContent>
          </Card>

          {/* Service details */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-zinc-300">Service Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-500">Number of Cans *</Label>
                  <Input
                    value={form.cans}
                    onChange={(e) => setField("cans", Math.max(1, parseInt(e.target.value) || 1))}
                    type="number"
                    min={1}
                    max={20}
                    className="bg-zinc-800 border-zinc-700 text-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Extra Bags</Label>
                  <Input
                    value={form.bagCount}
                    onChange={(e) => setField("bagCount", Math.max(0, parseInt(e.target.value) || 0))}
                    type="number"
                    min={0}
                    max={50}
                    className="bg-zinc-800 border-zinc-700 text-white mt-1"
                  />
                  <p className="text-[10px] text-zinc-600 mt-0.5">5 bags = 1 extra can</p>
                </div>
              </div>

              {/* Trash day */}
              <div>
                <Label className="text-xs text-zinc-500 flex items-center gap-1">
                  <Trash2 className="h-3 w-3" />
                  Trash Pickup Day
                </Label>
                <p className="text-[10px] text-zinc-600 mb-1">What day does your trash get collected?</p>
                <Select value={form.serviceDayOfWeek} onValueChange={(v) => setField("serviceDayOfWeek", v)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_OPTIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-zinc-500">Billing Plan</Label>
                <Select value={form.planType} onValueChange={(v) => setField("planType", v)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Recycling toggle + day */}
              <div className="space-y-3 pt-1 border-t border-zinc-800">
                <div className="flex items-center gap-3">
                  <Switch
                    id="recycling"
                    checked={form.recyclingEnabled}
                    onCheckedChange={(v) => setField("recyclingEnabled", v)}
                  />
                  <Label htmlFor="recycling" className="text-sm text-zinc-300 cursor-pointer flex items-center gap-1.5">
                    <Recycle className="h-4 w-4 text-green-400" />
                    Add recycling service (bi-weekly, separate day)
                  </Label>
                </div>

                {form.recyclingEnabled && (
                  <>
                    <div>
                      <Label className="text-xs text-zinc-500 flex items-center gap-1">
                        <Recycle className="h-3 w-3 text-green-400" />
                        Recycling Pickup Day
                      </Label>
                      <p className="text-[10px] text-zinc-600 mb-1">What day does your recycling get collected?</p>
                      <Select value={form.recyclingDayOfWeek} onValueChange={(v) => setField("recyclingDayOfWeek", v)}>
                        <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_OPTIONS.map((d) => (
                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500">First recycling week starts on (anchor date)</Label>
                      <DatePicker
                        value={form.recyclingAnchorDate ?? undefined}
                        onChange={(v) => setField("recyclingAnchorDate", v || "")}
                        placeholder="Pick anchor date"
                      />
                      <p className="text-[10px] text-zinc-500 mt-0.5">Sets which weeks are recycling weeks (every other week from this date)</p>
                    </div>
                  </>
                )}
              </div>

              <div>
                <Label className="text-xs text-zinc-500">Service Notes (optional)</Label>
                <Textarea
                  value={form.serviceNotes}
                  onChange={(e) => setField("serviceNotes", e.target.value)}
                  placeholder="Gate code, where to put cans, special instructions, etc."
                  className="bg-zinc-800 border-zinc-700 text-white mt-1 resize-none"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Pricing breakdown */}
          <Card className="bg-zinc-900 border-orange-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-zinc-300 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-orange-400" />
                Pricing Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {/* Trash service line */}
              <div className="flex justify-between text-zinc-400">
                <span className="flex items-center gap-1">🗑️ Trash — {quote.billableCans} can{quote.billableCans !== 1 ? "s" : ""} weekly</span>
                <span className="text-white">${quote.weeklyTrashCost.toFixed(2)}/wk</span>
              </div>
              <div className="flex justify-between text-zinc-500 text-xs">
                <span>× 52 ÷ 12 months</span>
                <span>${quote.projectedMonthlyTrash.toFixed(2)}/mo</span>
              </div>

              {/* Recycling service line */}
              {form.recyclingEnabled && (
                <>
                  <div className="flex justify-between text-green-400 pt-1">
                    <span className="flex items-center gap-1">♻️ Recycling — {quote.billableCans} can{quote.billableCans !== 1 ? "s" : ""} bi-weekly</span>
                    <span>${quote.weeklyRecyclingCost.toFixed(2)}/event</span>
                  </div>
                  <div className="flex justify-between text-zinc-500 text-xs">
                    <span>× 26 ÷ 12 months</span>
                    <span>${quote.projectedMonthlyRecycling.toFixed(2)}/mo</span>
                  </div>
                </>
              )}

              {quote.monthlyMinimumApplied && (
                <div className="flex justify-between text-yellow-400 text-xs pt-1">
                  <span>$30/month minimum applied</span>
                  <span>$30.00</span>
                </div>
              )}
              {quote.travelSurchargeMonthly > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>Travel surcharge</span>
                  <span className="text-white">+${quote.travelSurchargeMonthly.toFixed(2)}/mo</span>
                </div>
              )}
              <div className="border-t border-zinc-800 pt-2 flex justify-between font-bold">
                <span className="text-white">Monthly total</span>
                <span className="text-orange-400 text-base">${quote.finalMonthlyPrice.toFixed(2)}/mo</span>
              </div>
              {form.planType === "yearly" && (
                <p className="text-xs text-zinc-500">Yearly plan: 11 months billed, 12 months of service</p>
              )}
            </CardContent>
          </Card>

          {/* Promo code */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="pt-4 pb-4">
              <Label className="text-xs text-zinc-500">Promo Code (optional)</Label>
              <Input
                value={form.promoCode}
                onChange={(e) => setField("promoCode", e.target.value.toUpperCase())}
                placeholder="Enter code if you have one"
                className="bg-zinc-800 border-zinc-700 text-white mt-1"
                maxLength={20}
              />
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={bookMutation.isPending}
            className="w-full bg-orange-500 hover:bg-orange-400 text-white font-black text-base py-6"
          >
            {bookMutation.isPending ? "Booking…" : `Start Service — $${quote.finalMonthlyPrice.toFixed(2)}/mo`}
          </Button>

          <p className="text-center text-zinc-600 text-xs">
            No credit card required now. We'll reach out to set up billing.
          </p>
        </form>
      </div>
    </div>
  );
}
