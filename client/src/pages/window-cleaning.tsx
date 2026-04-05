import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft } from "lucide-react";
import WindowCleaningBooking from "@/components/WindowCleaningBooking";

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
          <div className="bg-zinc-900 border border-green-500/30 rounded-2xl p-5 text-center space-y-3">
            <div className="text-4xl">🪟</div>
            <h2 className="text-white font-black text-lg">Booking Received!</h2>
            <p className="text-zinc-400 text-sm">
              Total: <span className="text-white font-bold">${booked.total.toFixed(2)}</span>
            </p>
            <p className="text-zinc-500 text-xs">
              Our team will reach out to confirm — watch for a call from{" "}
              <a href="tel:+19062859312" className="text-orange-400 font-semibold">(906) 285-9312</a>
            </p>
            <button
              onClick={() => setBooked(null)}
              className="mt-2 px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-700 transition-all"
            >
              Book Another
            </button>
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
