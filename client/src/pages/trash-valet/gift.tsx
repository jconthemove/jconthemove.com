import { useState, useEffect } from "react";
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
import { ArrowLeft, CheckCircle2, Gift, Recycle, Trash2, Tag } from "lucide-react";
import BookingConfirmedTiles from "@/components/BookingConfirmedTiles";
import { calculateTrashValetQuote, TRASH_VALET_OUT_OF_AREA_MINIMUM } from "@shared/trashValetPricing";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import AddressSummaryPill from "@/components/AddressSummaryPill";

const DAY_OPTIONS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const GIFT_DISCOUNT = 0.10;
const TRAVEL_FEE_MONTHLY = 50;
const TRAVEL_THRESHOLD = 2.5;

interface GiftResult {
  yourSubscriptionId: string;
  giftSubscriptionId: string;
  yourMonthlyPrice: number;
  giftMonthlyPrice: number;
}

function emptyService() {
  return {
    address: "",
    city: "",
    state: "MI",
    zip: "",
    cans: 1,
    bagCount: 0,
    recyclingEnabled: false,
    serviceDayOfWeek: "1",
    recyclingDayOfWeek: "1",
    serviceNotes: "",
    planType: "yearly",
  };
}

function useDistanceMiles(address: string) {
  const [miles, setMiles] = useState(0);
  useEffect(() => {
    if (address.trim().length >= 8) {
      fetch(`/api/utility/estimate-drive-miles?address=${encodeURIComponent(address.trim())}`)
        .then(r => r.json())
        .then((d: any) => setMiles(typeof d.miles === "number" ? d.miles : 0))
        .catch(() => setMiles(0));
    } else {
      setMiles(0);
    }
  }, [address]);
  return miles;
}

function getAdjustedMonthly(service: ReturnType<typeof emptyService>, distanceMiles: number) {
  const quote = calculateTrashValetQuote({
    cans: Number(service.cans) || 0,
    bagCount: Number(service.bagCount) || 0,
    recyclingEnabled: service.recyclingEnabled,
    recyclingAnchorDate: null,
    planType: service.planType as "monthly" | "yearly",
  });
  const travelFeeApplied = distanceMiles > TRAVEL_THRESHOLD;
  const rawAdjusted = quote.finalMonthlyPrice + (travelFeeApplied ? TRAVEL_FEE_MONTHLY : 0);
  const baseMonthly = travelFeeApplied ? Math.max(TRASH_VALET_OUT_OF_AREA_MINIMUM, rawAdjusted) : rawAdjusted;
  // Yearly: 11 months billed, 12 months service = 1 month free
  const yearlyEffective = service.planType === "yearly" ? Math.round(baseMonthly * 11 / 12 * 100) / 100 : baseMonthly;
  // Gift discount on top of yearly (or monthly) rate
  const discounted = Math.round(yearlyEffective * (1 - GIFT_DISCOUNT) * 100) / 100;
  return { baseMonthly, yearlyEffective, discounted, quote, travelFeeApplied, isYearly: service.planType === "yearly" };
}

function ServiceBlock({
  title,
  icon,
  service,
  onChange,
  onPlaceSelect,
  distanceMiles,
  accentColor,
}: {
  title: string;
  icon: React.ReactNode;
  service: ReturnType<typeof emptyService>;
  onChange: (key: string, val: string | number | boolean) => void;
  onPlaceSelect: (place: { fullAddress: string; city: string; state: string; zip: string }) => void;
  distanceMiles: number;
  accentColor: string;
}) {
  const { baseMonthly, yearlyEffective, discounted, quote, travelFeeApplied, isYearly } = getAdjustedMonthly(service, distanceMiles);
  const [showAddressDetails, setShowAddressDetails] = useState(false);
  const [addressFromAutocomplete, setAddressFromAutocomplete] = useState(false);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <CardTitle className={`text-sm font-bold flex items-center gap-2 ${accentColor}`}>
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs text-zinc-500">Service Address *</Label>
          <PlacesAutocomplete
            value={service.address}
            onChange={(v) => {
              onChange("address", v);
              if (addressFromAutocomplete) {
                setAddressFromAutocomplete(false);
                setShowAddressDetails(true);
              } else if (v.trim().length > 0 && !showAddressDetails) {
                setShowAddressDetails(true);
              }
            }}
            onPlaceSelect={(place) => {
              onPlaceSelect(place);
              setAddressFromAutocomplete(true);
              setShowAddressDetails(false);
            }}
            placeholder="123 Main St, Ironwood, MI"
            className="mt-1"
            inputClassName="w-full rounded-md border border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/60 transition-all"
          />
          <p className="text-[10px] text-zinc-600 mt-1">Pick a suggestion - city, state, and ZIP fill in automatically.</p>
          {addressFromAutocomplete && !showAddressDetails && (service.city || service.zip) && (
            <AddressSummaryPill
              city={service.city}
              state={service.state}
              zip={service.zip}
              onEdit={() => setShowAddressDetails(true)}
            />
          )}
        </div>
        {showAddressDetails && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={service.city}
              onChange={e => onChange("city", e.target.value)}
              placeholder="City"
              className="bg-zinc-800 border-zinc-700 text-white"
            />
            <Input
              value={service.zip}
              onChange={e => onChange("zip", e.target.value)}
              placeholder="ZIP"
              className="bg-zinc-800 border-zinc-700 text-white"
              maxLength={5}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-zinc-500">Number of Cans</Label>
            <Input
              value={service.cans}
              onChange={e => onChange("cans", Math.max(1, parseInt(e.target.value) || 1))}
              type="number" min={1} max={20}
              className="bg-zinc-800 border-zinc-700 text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-500">Extra Bags</Label>
            <Input
              value={service.bagCount}
              onChange={e => onChange("bagCount", Math.max(0, parseInt(e.target.value) || 0))}
              type="number" min={0} max={50}
              className="bg-zinc-800 border-zinc-700 text-white mt-1"
            />
            <p className="text-[10px] text-zinc-600 mt-0.5">5 bags = 1 extra can</p>
          </div>
        </div>

        <div>
          <Label className="text-xs text-zinc-500 flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> Trash Pickup Day
          </Label>
          <Select value={service.serviceDayOfWeek} onValueChange={v => onChange("serviceDayOfWeek", v)}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map(d => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id={`recycling-${title}`}
            checked={service.recyclingEnabled}
            onCheckedChange={v => onChange("recyclingEnabled", v)}
          />
          <Label htmlFor={`recycling-${title}`} className="text-sm text-zinc-300 cursor-pointer flex items-center gap-1.5">
            <Recycle className="h-4 w-4 text-green-400" />
            Add recycling (bi-weekly)
          </Label>
        </div>

        {service.recyclingEnabled && (
          <div>
            <Label className="text-xs text-zinc-500">Recycling Day</Label>
            <Select value={service.recyclingDayOfWeek} onValueChange={v => onChange("recyclingDayOfWeek", v)}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label className="text-xs text-zinc-500">Special Notes (optional)</Label>
          <Textarea
            value={service.serviceNotes}
            onChange={e => onChange("serviceNotes", e.target.value)}
            placeholder="Gate code, instructions, etc."
            className="bg-zinc-800 border-zinc-700 text-white mt-1 resize-none"
            rows={2}
          />
        </div>

        {/* Mini price breakdown */}
        <div className="bg-zinc-800 rounded-xl p-3 space-y-1.5 text-xs">
          <div className="flex justify-between text-zinc-400">
            <span className="flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> {quote.billableCans} can{quote.billableCans !== 1 ? "s" : ""} weekly</span>
            <span className="text-white">${quote.weeklyTrashCost.toFixed(2)}/wk</span>
          </div>
          {service.recyclingEnabled && (
            <div className="flex justify-between text-green-400">
              <span className="flex items-center gap-1"><Recycle className="h-3.5 w-3.5" /> Recycling bi-weekly</span>
              <span>${quote.weeklyRecyclingCost.toFixed(2)}/event</span>
            </div>
          )}
          {(travelFeeApplied || quote.travelSurchargeMonthly > 0) && (
            <div className="flex justify-between text-amber-400">
              <span>Travel fee (out of area)</span>
              <span>+$50/mo</span>
            </div>
          )}
          <div className="border-t border-zinc-700 pt-1.5 flex justify-between">
            <span className="text-zinc-500">Regular monthly</span>
            <span className="text-zinc-500 line-through">${baseMonthly.toFixed(2)}/mo</span>
          </div>
          {isYearly && (
            <div className="flex justify-between text-blue-400">
              <span className="flex items-center gap-1">Yearly (1 month free)</span>
              <span>${yearlyEffective.toFixed(2)}/mo</span>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span className="text-green-400 flex items-center gap-1">
              <Tag className="h-3 w-3" /> Gift 10% off
            </span>
            <span className={accentColor + " text-sm"}>${discounted.toFixed(2)}/mo</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TrashValetGiftPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<GiftResult | null>(null);

  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [giftRecipientName, setGiftRecipientName] = useState("");
  const [yourService, setYourService] = useState(emptyService());
  const [giftService, setGiftService] = useState(emptyService());

  const yourMiles = useDistanceMiles(yourService.address);
  const giftMiles = useDistanceMiles(giftService.address);

  const { discounted: yourDiscounted } = getAdjustedMonthly(yourService, yourMiles);
  const { discounted: giftDiscounted } = getAdjustedMonthly(giftService, giftMiles);

  const giftMutation = useMutation<GiftResult, Error, object>({
    mutationFn: (data) =>
      apiRequest("POST", "/api/trash/gift-subscribe", data).then(r => r.json() as Promise<GiftResult>),
    onSuccess: (data) => {
      setResult(data);
      setSubmitted(true);
    },
    onError: (err) => {
      toast({ title: "Booking failed", description: err.message || "Something went wrong", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact.name.trim() || !contact.phone.trim()) {
      toast({ title: "Required", description: "Your name and phone are required.", variant: "destructive" });
      return;
    }
    if (!yourService.address.trim()) {
      toast({ title: "Required", description: "Your service address is required.", variant: "destructive" });
      return;
    }
    if (!giftService.address.trim()) {
      toast({ title: "Required", description: "Gift recipient's service address is required.", variant: "destructive" });
      return;
    }
    giftMutation.mutate({
      contact,
      giftRecipientName: giftRecipientName.trim() || "Gift Recipient",
      yourService: {
        ...yourService,
        cans: Number(yourService.cans),
        bagCount: Number(yourService.bagCount),
        serviceDayOfWeek: Number(yourService.serviceDayOfWeek),
        recyclingDayOfWeek: yourService.recyclingEnabled ? Number(yourService.recyclingDayOfWeek) : null,
      },
      giftService: {
        ...giftService,
        cans: Number(giftService.cans),
        bagCount: Number(giftService.bagCount),
        serviceDayOfWeek: Number(giftService.serviceDayOfWeek),
        recyclingDayOfWeek: giftService.recyclingEnabled ? Number(giftService.recyclingDayOfWeek) : null,
      },
    });
  };

  if (submitted && result) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-start px-4 pt-12 pb-16">
        <div className="max-w-sm w-full space-y-0 rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-900/20 via-zinc-900/80 to-zinc-950 overflow-hidden">
          <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
              <Gift className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <p className="font-extrabold text-white text-base leading-tight">Gift Plans Confirmed!</p>
              <p className="text-xs text-yellow-300 mt-0.5">Both subscriptions are saved - we'll reach out to each address.</p>
            </div>
          </div>

          <div className="px-4 py-4 space-y-3">
            {/* Your plan */}
            <div className="rounded-xl bg-zinc-800/60 border border-orange-500/30 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-2">Your Plan</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Address</span>
                  <span className="text-white text-right max-w-[55%] truncate">{yourService.address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Monthly rate</span>
                  <span className="font-bold text-orange-400">${result.yourMonthlyPrice.toFixed(2)}/mo</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Trash day</span>
                  <span className="text-white">{DAY_OPTIONS.find(d => d.value === yourService.serviceDayOfWeek)?.label ?? yourService.serviceDayOfWeek}s</span>
                </div>
              </div>
            </div>

            {/* Gift plan */}
            <div className="rounded-xl bg-zinc-800/60 border border-yellow-500/30 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 mb-2">Gift Plan - {giftRecipientName || "Gift Recipient"}</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Address</span>
                  <span className="text-white text-right max-w-[55%] truncate">{giftService.address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Monthly rate</span>
                  <span className="font-bold text-yellow-400">${result.giftMonthlyPrice.toFixed(2)}/mo</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Trash day</span>
                  <span className="text-white">{DAY_OPTIONS.find(d => d.value === giftService.serviceDayOfWeek)?.label ?? giftService.serviceDayOfWeek}s</span>
                </div>
              </div>
            </div>

            <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-center">
              <p className="text-green-400 font-bold text-sm">10% off applied to both plans</p>
              <p className="text-zinc-400 text-xs mt-0.5">Combined savings: ${((yourDiscounted + giftDiscounted) * 0.1 / 0.9).toFixed(2)}/mo</p>
            </div>

            <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/40 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2.5">What Happens Next</p>
              <div className="space-y-2">
                {[
                  "We'll contact you to confirm billing and first pickup dates for both addresses",
                  "Cans go out the night before - we bring them back after pickup",
                  "You'll receive Square invoices monthly for both plans",
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
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

            <BookingConfirmedTiles serviceType="trash_valet" customerEmail={contact.email} />
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
            <h1 className="text-xl font-black flex items-center gap-2">
              <Gift className="h-5 w-5 text-yellow-400" />
              Gift a Trash Valet Plan
            </h1>
            <p className="text-zinc-500 text-xs">Two addresses - 1 month free yearly - 10% off both</p>
          </div>
        </div>

        {/* Discount banner */}
        <div className="rounded-2xl bg-gradient-to-r from-yellow-900/40 to-orange-900/40 border border-yellow-500/30 px-4 py-4 space-y-2">
          <div className="flex items-center gap-3">
            <Gift className="h-8 w-8 text-yellow-300" />
            <div>
              <p className="font-black text-yellow-300 text-base">GIFT A PLAN - BEST DEAL</p>
              <p className="text-zinc-300 text-xs mt-0.5">Keep one for yourself, gift one to a neighbor</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 text-center">
              <p className="text-blue-300 font-bold text-xs">Yearly Plan</p>
              <p className="text-white text-[10px] mt-0.5">1 month free<br />(11 billed, 12 service)</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2 text-center">
              <p className="text-green-300 font-bold text-xs">Gift Discount</p>
              <p className="text-white text-[10px] mt-0.5">10% off every month<br />on top of yearly rate</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Purchaser info */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-zinc-300">Your Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-zinc-500">Full Name *</Label>
                <Input
                  value={contact.name}
                  onChange={e => setContact(c => ({ ...c, name: e.target.value }))}
                  placeholder="Your full name"
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Phone *</Label>
                <Input
                  value={contact.phone}
                  onChange={e => setContact(c => ({ ...c, phone: e.target.value }))}
                  placeholder="Best phone number"
                  type="tel"
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Email</Label>
                <Input
                  value={contact.email}
                  onChange={e => setContact(c => ({ ...c, email: e.target.value }))}
                  placeholder="Best email address"
                  type="email"
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Your service */}
          <ServiceBlock
            title="Your Service"
            icon={<Trash2 className="h-4 w-4" />}
            service={yourService}
            onChange={(k, v) => setYourService(s => ({ ...s, [k]: v }))}
            onPlaceSelect={(p) => setYourService(s => ({
              ...s,
              address: p.fullAddress,
              city: p.city || s.city,
              state: p.state || s.state,
              zip: p.zip || s.zip,
            }))}
            distanceMiles={yourMiles}
            accentColor="text-orange-400"
          />

          {/* Gift recipient name */}
          <div className="flex items-center gap-3 bg-zinc-900 border border-yellow-500/20 rounded-2xl px-4 py-3">
            <Gift className="h-5 w-5 text-yellow-400 flex-shrink-0" />
            <div className="flex-1">
              <Label className="text-xs text-zinc-500">Gift Recipient's Name (optional)</Label>
              <Input
                value={giftRecipientName}
                onChange={e => setGiftRecipientName(e.target.value)}
                placeholder="Neighbor or friend's name"
                className="bg-zinc-800 border-zinc-700 text-white mt-1"
              />
            </div>
          </div>

          {/* Gift service */}
          <ServiceBlock
            title="Gift Recipient's Service"
            icon={<Gift className="h-4 w-4" />}
            service={giftService}
            onChange={(k, v) => setGiftService(s => ({ ...s, [k]: v }))}
            onPlaceSelect={(p) => setGiftService(s => ({
              ...s,
              address: p.fullAddress,
              city: p.city || s.city,
              state: p.state || s.state,
              zip: p.zip || s.zip,
            }))}
            distanceMiles={giftMiles}
            accentColor="text-yellow-400"
          />

          {/* Combined price summary */}
          <Card className="bg-zinc-900 border-yellow-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-yellow-300 flex items-center gap-1.5">
                <Tag className="h-4 w-4" /> Combined Total - Yearly + 10% Gift Off
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Your plan</span>
                <span className="text-orange-400 font-bold">${yourDiscounted.toFixed(2)}/mo</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Gift plan</span>
                <span className="text-yellow-400 font-bold">${giftDiscounted.toFixed(2)}/mo</span>
              </div>
              <div className="border-t border-zinc-800 pt-2 flex justify-between font-bold">
                <span className="text-white">Total monthly</span>
                <span className="text-green-400 text-base">${(yourDiscounted + giftDiscounted).toFixed(2)}/mo</span>
              </div>
              <p className="text-[10px] text-zinc-500 text-center">Yearly plan: 11 months billed, 12 months service - 10% gift discount on top</p>
              <p className="text-[10px] text-zinc-500 text-center">Billed separately per address via Square invoice</p>
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={giftMutation.isPending}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black text-base py-6"
          >
            {giftMutation.isPending ? "Booking Both Plans..." : `Gift a Plan - $${(yourDiscounted + giftDiscounted).toFixed(2)}/mo combined`}
          </Button>

          <p className="text-center text-zinc-600 text-xs">
            No credit card required now. We'll reach out to set up billing for both addresses.
          </p>
          <p className="text-center text-zinc-600 text-[10px]">
            By submitting you agree to our{" "}
            <a href="/terms" className="text-zinc-400 underline">Terms of Service</a>,
            including our Trash Valet subscription and cancellation policy.
          </p>
        </form>
      </div>
    </div>
  );
}
