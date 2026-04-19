import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import WindowCleaningBooking from "@/components/WindowCleaningBooking";
import BookingConfirmedTiles from "@/components/BookingConfirmedTiles";

export default function WindowCleaningPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [booked, setBooked] = useState<{ jobId: string; total: number } | null>(null);
  const isApril = new Date().getMonth() === 3;

  return (
    <div className="min-h-screen bg-zinc-950 pb-16">
      <div className="max-w-[430px] mx-auto px-4 pt-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/")}
            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">Clean Windows with JC</h1>
              {isApril && (
                <span className="text-[10px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full">
                  April Special — 20% Off
                </span>
              )}
            </div>
            <p className="text-zinc-500 text-xs">Residential &amp; commercial window cleaning</p>
          </div>
        </div>

        {/* Info strip */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-2">
            <p className="text-white font-black text-base">$5</p>
            <p className="text-zinc-500 text-[10px] font-medium">per pane</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-2">
            <p className="text-white font-black text-base">4 min</p>
            <p className="text-zinc-500 text-[10px] font-medium">minimum</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-2">
            <p className="text-white font-black text-base">🪟</p>
            <p className="text-zinc-500 text-[10px] font-medium">streak-free</p>
          </div>
        </div>

        {booked ? (
          <div className="rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-900/20 via-zinc-900/80 to-zinc-900 overflow-hidden">
            <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <p className="font-extrabold text-white text-base leading-tight">Booking Confirmed!</p>
                <p className="text-xs text-green-300 mt-0.5">We'll reach out shortly to finalize your appointment.</p>
              </div>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/50 px-4 py-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Your Estimate</p>
                <p className="text-2xl font-extrabold text-white">${booked.total.toFixed(2)}</p>
                <p className="text-xs text-zinc-400 mt-1">Final invoice sent after we confirm your appointment.</p>
              </div>
              <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/40 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2.5">What Happens Next</p>
                <div className="space-y-2">
                  {[
                    "Darrell reviews your booking and confirms the time",
                    "You receive a Square invoice — pay to lock in your date",
                    "Our crew arrives on your scheduled day — streak-free guaranteed ✅",
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
              <button
                onClick={() => setBooked(null)}
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-700 transition-all"
              >
                Book Another
              </button>
              <BookingConfirmedTiles serviceType="window_cleaning" />
            </div>
          </div>
        ) : (
          <WindowCleaningBooking
            user={user}
            onBooked={(jobId, total) => setBooked({ jobId, total })}
          />
        )}
      </div>
    </div>
  );
}
