import { useEffect, useMemo, useState } from "react";
import { Coins, Star } from "lucide-react";

type CrewStatusKey = "available" | "jobs_today" | "busy" | "scheduling_ahead";
type Tone = "green" | "yellow" | "red" | "gray";

type CrewStatusResponse = {
  status: CrewStatusKey;
  title: string;
  subtitle: string;
  badge: string;
  tone: Tone;
  ctaHint: string;
  refreshedAt: string;
};

const FALLBACK: CrewStatusResponse = {
  status: "jobs_today",
  title: "Jobs Booked Today",
  subtitle: "Crew is active — some same-day spots remain",
  badge: "Limited",
  tone: "yellow",
  ctaHint: "Grab a slot before the crew fills up",
  refreshedAt: new Date().toISOString(),
};

function toneStyles(tone: Tone) {
  switch (tone) {
    case "green":
      return {
        ring:   "border-emerald-500/40",
        dot:    "bg-emerald-400",
        dotRing:"bg-emerald-400/30",
        badge:  "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30",
        bar:    "bg-emerald-500/10 border-emerald-500/20",
        barText:"text-emerald-300",
        cta:    "from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500",
        accent: "text-emerald-400",
      };
    case "yellow":
      return {
        ring:   "border-yellow-500/40",
        dot:    "bg-yellow-400",
        dotRing:"bg-yellow-400/30",
        badge:  "bg-yellow-500/15 text-yellow-300 border border-yellow-400/30",
        bar:    "bg-yellow-500/10 border-yellow-500/20",
        barText:"text-yellow-300",
        cta:    "from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500",
        accent: "text-yellow-400",
      };
    case "red":
      return {
        ring:   "border-red-500/40",
        dot:    "bg-red-400",
        dotRing:"bg-red-400/30",
        badge:  "bg-red-500/15 text-red-300 border border-red-400/30",
        bar:    "bg-red-500/10 border-red-500/20",
        barText:"text-red-300",
        cta:    "from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500",
        accent: "text-red-400",
      };
    default: // gray
      return {
        ring:   "border-white/10",
        dot:    "bg-zinc-400",
        dotRing:"bg-zinc-400/20",
        badge:  "bg-white/8 text-zinc-300 border border-white/12",
        bar:    "bg-white/5 border-white/10",
        barText:"text-zinc-300",
        cta:    "from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600",
        accent: "text-slate-400",
      };
  }
}

export default function CrewStatusCard() {
  const [data, setData]   = useState<CrewStatusResponse>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/crew-status");
      if (!res.ok) throw new Error(`${res.status}`);
      const next = (await res.json()) as CrewStatusResponse;
      setData(prev => {
        if (prev.status !== next.status) {
          setPulse(true);
          setTimeout(() => setPulse(false), 800);
        }
        return next;
      });
    } catch {
      setData(FALLBACK);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 30_000);
    return () => clearInterval(id);
  }, []);

  const s = useMemo(() => toneStyles(data.tone), [data.tone]);

  return (
    <div className={[
      "relative overflow-hidden rounded-2xl border bg-slate-900/80 backdrop-blur-sm p-4 text-white transition-all duration-500",
      s.ring,
      pulse ? "scale-[1.01]" : "scale-100",
    ].join(" ")}>

      {/* Status row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Pulsing dot with ring */}
          <span className="relative flex-shrink-0 flex h-3 w-3">
            <span className={["absolute inline-flex h-full w-full rounded-full animate-ping opacity-60", s.dotRing].join(" ")} />
            <span className={["relative inline-flex h-3 w-3 rounded-full", s.dot].join(" ")} />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 leading-none mb-0.5">Live Status</p>
            <p className="text-sm font-extrabold text-white leading-tight">
              {loading ? "Checking…" : data.title}
            </p>
          </div>
        </div>
        <span className={["shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap", s.badge].join(" ")}>
          {data.badge}
        </span>
      </div>

      {/* Subtitle / ctaHint */}
      <p className={["text-xs mb-3 leading-snug", s.barText].join(" ")}>
        {loading ? "Refreshing crew data…" : data.ctaHint}
      </p>

      {/* JCMOVES customer incentive rows */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <Coins className="h-3 w-3 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] text-slate-400">Earn <span className="text-amber-400 font-semibold">JCMOVES on every booking</span> — redeem on services &amp; shop credit</span>
        </div>
        <div className="flex items-center gap-2">
          <Star className="h-3 w-3 text-purple-400 flex-shrink-0" />
          <span className="text-[10px] text-slate-400"><span className="text-purple-400 font-semibold">Stake your JCMOVES</span> for priority booking slots &amp; bigger discounts</span>
        </div>
      </div>

      {/* Refresh timestamp */}
      {!loading && (
        <p className="text-[9px] text-slate-600 mt-2 text-right">
          Updated {new Date(data.refreshedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
