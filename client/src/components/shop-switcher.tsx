import { useLocation } from "wouter";
import { Coins, Truck } from "lucide-react";

export function ShopSwitcher() {
  const [location, setLocation] = useLocation();

  const onEarn = location.startsWith("/services");
  const onSpend = location.startsWith("/marketplace");

  if (!onEarn && !onSpend) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-0 rounded-full bg-black/40 backdrop-blur-md border border-white/15 shadow-2xl shadow-black/40 p-1">

        {/* Earn tab */}
        <button
          onClick={() => setLocation("/services")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 ${
            onEarn
              ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          <Truck className="h-4 w-4" />
          <span>Earn</span>
          {onEarn && (
            <span className="text-[10px] font-semibold text-blue-200 bg-blue-400/25 px-1.5 py-0.5 rounded-full">
              Moving Shop
            </span>
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-white/15 mx-0.5" />

        {/* Spend tab */}
        <button
          onClick={() => setLocation("/marketplace")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 ${
            onSpend
              ? "bg-purple-500 text-white shadow-lg shadow-purple-500/30"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          <Coins className="h-4 w-4" />
          <span>Spend</span>
          {onSpend && (
            <span className="text-[10px] font-semibold text-purple-200 bg-purple-400/25 px-1.5 py-0.5 rounded-full">
              Reward Shop
            </span>
          )}
        </button>

      </div>

      {/* Subtle label under the pill */}
      <p className="text-center text-[10px] text-white/30 mt-1.5 font-medium tracking-wide">
        {onEarn ? "Buy services · earn JCMOVES" : "Redeem JCMOVES · get rewards"}
      </p>
    </div>
  );
}
