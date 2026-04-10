import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Tag, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { calculateWindowCleaningQuote } from "@shared/windowCleaningPricing";

interface AuthUser {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
}

interface BookingResponse {
  jobId: string;
  paneCount: number;
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  total: number;
  promoApplied: boolean;
  message: string;
}

interface WindowCleaningBookingProps {
  user?: AuthUser;
  onBooked?: (jobId: string, total: number) => void;
}

const ADDON_SERVICES = [
  { id: "junk_removal",  label: "Junk Removal",   emoji: "🗑️" },
  { id: "trash_valet",   label: "Trash Valet",     emoji: "♻️" },
  { id: "lawn_care",     label: "Lawn Care",        emoji: "🌿" },
  { id: "moving",        label: "Moving Help",      emoji: "📦" },
  { id: "snow_removal",  label: "Snow Removal",     emoji: "❄️" },
  { id: "handyman",      label: "Handyman",         emoji: "🔧" },
] as const;

export default function WindowCleaningBooking({ user, onBooked }: WindowCleaningBookingProps) {
  const { toast } = useToast();

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phoneNumber || "");
  const [address, setAddress] = useState("");
  const [addressTouched, setAddressTouched] = useState(false);
  const [distanceMiles, setDistanceMiles] = useState(0);

  // Fetch drive distance when address changes
  useEffect(() => {
    const addr = address.trim();
    if (addr.length >= 8) {
      fetch(`/api/utility/estimate-drive-miles?address=${encodeURIComponent(addr)}`)
        .then(r => r.json())
        .then((d: any) => setDistanceMiles(typeof d.miles === "number" ? d.miles : 0))
        .catch(() => setDistanceMiles(0));
    } else {
      setDistanceMiles(0);
    }
  }, [address]);

  const [standardWindows, setStandardWindows] = useState(5);
  const [largeWindows, setLargeWindows] = useState(0);
  const [ladderWindows, setLadderWindows] = useState(0);
  const [includeInside, setIncludeInside] = useState(true);
  const [includeOutside, setIncludeOutside] = useState(true);
  const [seasonMode, setSeasonMode] = useState<"normal" | "winter_inside_only">("normal");
  const [promoCode, setPromoCode] = useState("");
  const [promoSubmitted, setPromoSubmitted] = useState("");
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  const [showDetails, setShowDetails] = useState(false);

  const isApril = new Date().getMonth() === 3;
  const addonSelected = selectedAddons.length > 0;

  const quote = calculateWindowCleaningQuote(
    { standardWindows, largeWindows, ladderWindows, includeInside, includeOutside, seasonMode, promoCode: promoSubmitted, addonSelected },
    isApril,
  );

  const travelFee = distanceMiles > 5 ? 50 : 0;
  const adjustedTotal = quote.total + travelFee;

  const addressError = addressTouched && address.trim().length < 8;

  const canSubmit =
    firstName.trim().length > 0 &&
    phone.trim().length >= 7 &&
    address.trim().length >= 8 &&
    (standardWindows + largeWindows + ladderWindows) > 0;

  const toggleAddon = (id: string) => {
    setSelectedAddons(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const book = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/window-cleaning/quote", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || "noreply@jconthemove.com",
        phone: phone.trim(),
        address: address.trim(),
        standardWindows,
        largeWindows,
        ladderWindows,
        includeInside,
        includeOutside,
        seasonMode,
        promoCode: promoSubmitted.trim(),
        addonSelected,
        addons: selectedAddons,
        travelFee,
        distanceMiles,
      });
      if (!res.ok) {
        const errBody = await res.json() as { error?: string };
        throw new Error(errBody.error || "Booking failed");
      }
      return res.json() as Promise<BookingResponse>;
    },
    onSuccess: (data: BookingResponse) => {
      toast({ title: "Booking submitted!", description: `We'll reach out shortly. Total: $${data.total}` });
      onBooked?.(data.jobId, data.total);
    },
    onError: (err: Error) => {
      toast({ title: "Booking failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  function Counter({ label, value, onChange, min = 0, max = 50 }: {
    label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
  }) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange(Math.max(min, value - 1))}
            className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:bg-zinc-700 active:scale-90 font-bold text-lg leading-none"
          >−</button>
          <span className="text-white font-bold w-5 text-center">{value}</span>
          <button
            type="button"
            onClick={() => onChange(Math.min(max, value + 1))}
            className="w-8 h-8 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 hover:bg-orange-500/30 active:scale-90 font-bold text-lg leading-none"
          >+</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-md mx-auto">

      {/* Window Count Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Window Count</p>
        <Counter label="Standard Windows" value={standardWindows} onChange={setStandardWindows} />
        <Counter label="Large Windows (2× panes)" value={largeWindows} onChange={setLargeWindows} />
        <Counter label="Ladder Windows (2× rate)" value={ladderWindows} onChange={setLadderWindows} />
      </div>

      {/* Options Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Options</p>

        {/* Season toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-white font-medium">Season Mode</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSeasonMode("normal")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                seasonMode === "normal"
                  ? "bg-orange-500/15 border-orange-500 text-orange-300"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => setSeasonMode("winter_inside_only")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                seasonMode === "winter_inside_only"
                  ? "bg-blue-500/15 border-blue-500 text-blue-300"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              Winter (Inside Only)
            </button>
          </div>
        </div>

        {/* Inside/Outside toggles */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-white font-medium">Clean Inside</span>
          <button
            type="button"
            onClick={() => setIncludeInside(v => !v)}
            className={`relative w-12 h-6 rounded-full border transition-all ${
              includeInside ? "bg-orange-500 border-orange-400" : "bg-zinc-700 border-zinc-600"
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${includeInside ? "left-6" : "left-0.5"}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${seasonMode === "winter_inside_only" ? "text-zinc-600" : "text-white"}`}>
            Clean Outside {seasonMode === "winter_inside_only" && <span className="text-xs">(disabled in winter)</span>}
          </span>
          <button
            type="button"
            disabled={seasonMode === "winter_inside_only"}
            onClick={() => setIncludeOutside(v => !v)}
            className={`relative w-12 h-6 rounded-full border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              includeOutside && seasonMode !== "winter_inside_only"
                ? "bg-orange-500 border-orange-400"
                : "bg-zinc-700 border-zinc-600"
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
              includeOutside && seasonMode !== "winter_inside_only" ? "left-6" : "left-0.5"
            }`} />
          </button>
        </div>
      </div>

      {/* Add-On Services — 10% bundle discount */}
      <div className={`rounded-2xl p-4 space-y-3 border transition-all ${
        addonSelected
          ? "bg-green-900/20 border-green-500/40"
          : "bg-zinc-900 border-zinc-800"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <Plus className="h-3 w-3" /> Add a Service
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Save an extra 10% on windows when you add another service</p>
          </div>
          {addonSelected && (
            <span className="bg-green-500/20 text-green-300 text-[10px] font-bold px-2 py-1 rounded-full border border-green-500/30">
              −10% applied
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {ADDON_SERVICES.map(svc => {
            const active = selectedAddons.includes(svc.id);
            return (
              <button
                key={svc.id}
                type="button"
                onClick={() => toggleAddon(svc.id)}
                className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-center transition-all active:scale-95 ${
                  active
                    ? "bg-green-500/15 border-green-500/50 text-green-300"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                <span className="text-lg leading-none">{svc.emoji}</span>
                <span className="text-[10px] font-semibold leading-tight">{svc.label}</span>
                {active && <span className="text-[9px] text-green-400 font-bold">✓ Added</span>}
              </button>
            );
          })}
        </div>

        {addonSelected && (
          <p className="text-[11px] text-green-400 text-center">
            🎉 Bundle discount active — 10% off windows! We'll quote your {selectedAddons.length > 1 ? "add-ons" : "add-on"} separately.
          </p>
        )}
      </div>

      {/* Live Quote Panel */}
      <div className="bg-zinc-900 border border-orange-500/30 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Live Quote</p>
          <button
            type="button"
            onClick={() => setShowDetails(v => !v)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 text-xs"
          >
            Details {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {showDetails && (
          <div className="text-xs text-zinc-500 space-y-1 border-b border-zinc-800 pb-3">
            <div className="flex justify-between">
              <span>Standard panes ({quote.breakdown.standardPanes})</span>
              <span>${(quote.breakdown.standardPanes * 5).toFixed(2)}</span>
            </div>
            {quote.breakdown.largePanes > 0 && (
              <div className="flex justify-between">
                <span>Large panes ({quote.breakdown.largePanes})</span>
                <span>${(quote.breakdown.largePanes * 5).toFixed(2)}</span>
              </div>
            )}
            {quote.breakdown.ladderPanes > 0 && (
              <div className="flex justify-between">
                <span>Ladder panes ({quote.breakdown.ladderPanes} × 2×)</span>
                <span>${(quote.breakdown.ladderPanes * 10).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>4-window minimum</span>
              <span>applied</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-zinc-400 text-sm">Subtotal</span>
          <span className="text-white font-bold">${quote.subtotal.toFixed(2)}</span>
        </div>

        {quote.promoApplied && (
          <div className="flex items-center justify-between text-green-400">
            <span className="text-sm flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              CLEANWINDOWS (−{quote.promoDiscountPercent}%)
            </span>
            <span className="font-bold">−${quote.promoDiscountAmount.toFixed(2)}</span>
          </div>
        )}

        {quote.addonDiscountApplied && (
          <div className="flex items-center justify-between text-green-400">
            <span className="text-sm flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Bundle add-on discount (−10%)
            </span>
            <span className="font-bold">−${quote.addonDiscountAmount.toFixed(2)}</span>
          </div>
        )}

        {travelFee > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-amber-400 text-xs">Travel fee (out of area)</span>
            <span className="text-amber-400 text-xs font-semibold">+${travelFee.toFixed(2)}</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
          <span className="text-zinc-300 font-semibold text-sm">Total</span>
          <span className="text-white font-black text-2xl">${adjustedTotal.toFixed(2)}</span>
        </div>

        <p className="text-zinc-600 text-[10px]">$5/pane · 4-window minimum · Ladder access billed at 2× rate</p>
      </div>

      {/* Promo Code */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Promo Code</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              placeholder="e.g. CLEANWINDOWS"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => setPromoSubmitted(promoCode)}
            className="px-4 py-2 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400 text-sm font-bold hover:bg-orange-500/30 transition-all"
          >
            Apply
          </button>
        </div>
        {quote.promoError && (
          <p className="flex items-center gap-1 text-red-400 text-xs">
            <AlertCircle className="h-3 w-3" />
            {quote.promoError}
          </p>
        )}
        {quote.promoApplied && (
          <p className="flex items-center gap-1 text-green-400 text-xs">
            <CheckCircle2 className="h-3 w-3" />
            10% April discount applied!
          </p>
        )}
        {isApril && !quote.promoApplied && (
          <p className="text-orange-400 text-xs font-medium">🎉 Enter CLEANWINDOWS for 10% off — April special!</p>
        )}
      </div>

      {/* Contact Info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Your Info</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 font-semibold block mb-1">First Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Jane"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 font-semibold block mb-1">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder="Smith"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500 font-semibold block mb-1">Phone <span className="text-red-400">*</span></label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(906) 555-0100"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 font-semibold block mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
        <AddressAutocomplete
          value={address}
          onChange={setAddress}
          onBlur={() => setAddressTouched(true)}
          label="Service Address"
          required
          error={addressError}
          errorMessage="Enter a full street address (e.g. 123 Main St, Ironwood, MI)"
        />
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={() => { setAddressTouched(true); if (canSubmit) book.mutate(); }}
        disabled={!canSubmit || book.isPending}
        className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-white font-black text-base shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
      >
        {book.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>🪟 Book Now · ${adjustedTotal.toFixed(2)}{addonSelected ? " + add-ons" : ""}</>
        )}
      </button>
      {addonSelected && (
        <p className="text-center text-xs text-green-500">
          Your selected add-on{selectedAddons.length > 1 ? "s" : ""} ({selectedAddons.map(id => ADDON_SERVICES.find(s => s.id === id)?.label).join(", ")}) will be quoted separately.
        </p>
      )}
      <p className="text-center text-xs text-zinc-600">⚡ Most jobs booked in under 30 seconds</p>
    </div>
  );
}
