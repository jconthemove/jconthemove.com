import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Coins, Phone, MessageSquare, Calculator, ChevronRight, Loader2, Search } from "lucide-react";
import ServiceSelector from "@/components/ServiceSelector";
import LiveCrewBeacon from "@/components/LiveCrewBeacon";

// ── Job Status Card (post-booking polling) ────────────────────────────────────

function JobStatusCard({ jobId, totalPrice, onDismiss }: { jobId: string; totalPrice: number; onDismiss: () => void }) {
  const { data, isLoading } = useQuery<{ status: string; crewCount: number; crewSize: number; serviceType: string }>({
    queryKey: ["/api/jobs", jobId, "status"],
    queryFn: () => fetch(`/api/jobs/${jobId}/status`).then(r => r.json()),
    refetchInterval: 4000,
  });

  const status = data?.status ?? "";
  const crewReady = ["available", "assigned", "in_progress"].includes(status) && (data?.crewCount ?? 0) > 0;
  const priceConfirmed = status === "quoted";
  const isJunk = data?.serviceType === "junk";

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Booking Status</span>
        <button onClick={onDismiss} className="text-zinc-600 text-xs hover:text-zinc-400">Dismiss</button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking status…</span>
        </div>
      ) : crewReady ? (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🟢</span>
            <span className="font-bold text-white">Crew Assigned!</span>
          </div>
          <p className="text-sm text-zinc-400">
            {data?.crewCount} {isJunk ? "crew member" : "mover"}{(data?.crewCount ?? 1) > 1 ? "s" : ""} assigned · Total: <span className="text-white font-semibold">${totalPrice}</span>
          </p>
          <p className="text-xs text-zinc-500 mt-1">They'll be in touch to confirm details.</p>
        </div>
      ) : priceConfirmed ? (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">✅</span>
            <span className="font-bold text-white">Price Confirmed!</span>
          </div>
          <p className="text-sm text-zinc-400">Total: <span className="text-white font-semibold">${totalPrice}</span></p>
          <p className="text-xs text-zinc-500 mt-1">
            {isJunk ? "Call us to schedule your pickup:" : "Call to confirm:"}{" "}
            <a href="tel:+19062859312" className="text-orange-400 font-semibold">(906) 285-9312</a>
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Search className="h-5 w-5 text-orange-400 animate-pulse" />
            <span className="font-bold text-white">Booking received!</span>
          </div>
          <p className="text-sm text-zinc-400">Total: <span className="text-white font-semibold">${totalPrice}</span></p>
          <p className="text-xs text-zinc-500 mt-0.5">Our team will reach out to confirm — watch for a call from (906) 285-9312.</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CustomerHomePage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeBooking, setActiveBooking] = useState<{ jobId: string; totalPrice: number } | null>(null);

  const { data: wallet } = useQuery<{ tokenBalance: string }>({
    queryKey: ["/api/rewards/wallet"],
    retry: 2,
  });

  const tokenBalance = parseFloat(wallet?.tokenBalance || "0");

  return (
    <div className="min-h-screen bg-zinc-950 pb-28">
      <div className="max-w-[430px] mx-auto px-4 pt-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-500 text-sm">Hey, {user?.firstName || "there"}</p>
            <h1 className="text-2xl font-black text-white">Need Help Today?</h1>
          </div>
          <button
            onClick={() => setLocation("/wallet")}
            className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2"
          >
            <Coins className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-bold text-white">
              {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] text-zinc-500 font-medium">JCMOVES</span>
          </button>
        </div>

        {/* Hero CTAs */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setLocation("/moving-estimator")}
            className="flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl bg-orange-500 hover:bg-orange-400 active:scale-[0.97] transition-all shadow-lg shadow-orange-500/20"
          >
            <Calculator className="h-6 w-6 text-white" />
            <span className="text-white font-black text-sm leading-tight text-center">
              Get Price in<br />30 Seconds
            </span>
          </button>
          <div className="grid grid-rows-2 gap-2">
            <button
              onClick={() => window.open("tel:+19062226009", "_self")}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 active:scale-[0.97] transition-all"
            >
              <Phone className="h-4 w-4 text-emerald-400" />
              <span className="text-white font-bold text-sm">Call a Mover</span>
            </button>
            <button
              onClick={() => window.open("sms:+19062226009", "_self")}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 active:scale-[0.97] transition-all"
            >
              <MessageSquare className="h-4 w-4 text-blue-400" />
              <span className="text-white font-bold text-sm">Text a Mover</span>
            </button>
          </div>
        </div>

        {/* Live crew beacon */}
        <LiveCrewBeacon />

        {/* Post-booking status card */}
        {activeBooking && (
          <JobStatusCard
            jobId={activeBooking.jobId}
            totalPrice={activeBooking.totalPrice}
            onDismiss={() => setActiveBooking(null)}
          />
        )}

        {/* Service selector */}
        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">What do you need?</h2>
          <ServiceSelector
            defaultService="junk"
            user={user}
            onBooked={(id, price) => setActiveBooking({ jobId: id, totalPrice: price })}
          />
        </div>

        {/* Instant estimate CTA block */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center flex-shrink-0">
              <Calculator className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Get an Instant Estimate</p>
              <p className="text-zinc-500 text-xs">Live moving price calculator</p>
            </div>
          </div>
          <button
            onClick={() => setLocation("/moving-estimator")}
            className="flex items-center gap-1 bg-orange-500 hover:bg-orange-400 active:scale-[0.97] transition-all text-white font-bold text-xs px-3 py-2 rounded-xl whitespace-nowrap"
          >
            Start <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Earn strip */}
        <button
          onClick={() => setLocation("/earn")}
          className="w-full flex items-center justify-between bg-zinc-900 border border-orange-500/20 rounded-2xl px-4 py-3 hover:border-orange-500/40 active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <Coins className="h-5 w-5 text-orange-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-white">Earn JCMOVES</p>
              <p className="text-xs text-zinc-500">15 tokens per $1 spent · redeem for rewards</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-600" />
        </button>

      </div>
    </div>
  );
}
