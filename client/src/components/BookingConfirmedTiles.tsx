import { Link } from "wouter";
import { Gem, ChevronRight, Coins } from "lucide-react";

export default function BookingConfirmedTiles() {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center mb-3">
        While You Wait — Explore More
      </p>

      {/* Ashley's Jewelry Shop */}
      <Link href="/nature-made-jewls">
        <a className="flex items-center gap-3 rounded-2xl border border-rose-500/25 bg-gradient-to-r from-rose-900/25 to-pink-900/15 px-4 py-3 hover:border-rose-500/50 transition-all active:scale-[0.98]">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center shrink-0">
            <Gem className="h-5 w-5 text-rose-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Ashley's Jewelry Shop</p>
            <p className="text-xs text-rose-300/80 mt-0.5">Nature Made Jewls · Handcrafted with love</p>
          </div>
          <ChevronRight className="h-4 w-4 text-rose-400/60 shrink-0" />
        </a>
      </Link>

      {/* Rewards Marketplace */}
      <Link href="/marketplace">
        <a className="flex items-center gap-3 rounded-2xl border border-orange-500/25 bg-gradient-to-r from-orange-900/25 to-amber-900/15 px-4 py-3 hover:border-orange-500/50 transition-all active:scale-[0.98]">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
            <Coins className="h-5 w-5 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-tight">Earn &amp; Redeem JCMOVES</p>
            <p className="text-xs text-orange-300/80 mt-0.5">Rewards marketplace · Tokens earned every job</p>
          </div>
          <ChevronRight className="h-4 w-4 text-orange-400/60 shrink-0" />
        </a>
      </Link>
    </div>
  );
}
