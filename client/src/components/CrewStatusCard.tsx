import { useEffect, useMemo, useState } from "react";
import { Phone, ChevronRight, Sparkles, CalendarCheck } from "lucide-react";
import { Link } from "wouter";

type CrewStatusKey = "ready" | "limited" | "high_demand" | "scheduling_ahead";
type Tone = "green" | "orange" | "red" | "gray";

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
  status: "limited",
  title: "Limited Availability Today",
  subtitle: "Same-day spots are filling fast",
  badge: "Limited",
  tone: "orange",
  ctaHint: "Book now to lock in your spot",
  refreshedAt: new Date().toISOString(),
};

function toneStyles(tone: Tone) {
  switch (tone) {
    case "green":
      return {
        ring:  "border-emerald-500/30",
        glow:  "shadow-[0_0_36px_rgba(16,185,129,0.20)]",
        dot:   "bg-emerald-400",
        badge: "bg-emerald-500/15 text-emerald-300 border border-emerald-400/25",
        cta:   "from-emerald-500 to-teal-600 shadow-emerald-900/30",
        accent:"text-emerald-400",
      };
    case "red":
      return {
        ring:  "border-red-500/30",
        glow:  "shadow-[0_0_36px_rgba(239,68,68,0.18)]",
        dot:   "bg-red-400",
        badge: "bg-red-500/15 text-red-300 border border-red-400/25",
        cta:   "from-red-500 to-orange-600 shadow-red-900/30",
        accent:"text-red-400",
      };
    case "gray":
      return {
        ring:  "border-white/10",
        glow:  "shadow-[0_0_24px_rgba(255,255,255,0.05)]",
        dot:   "bg-zinc-400",
        badge: "bg-white/8 text-zinc-300 border border-white/12",
        cta:   "from-slate-600 to-slate-700 shadow-slate-900/30",
        accent:"text-slate-400",
      };
    default: // orange
      return {
        ring:  "border-orange-500/30",
        glow:  "shadow-[0_0_36px_rgba(251,146,60,0.20)]",
        dot:   "bg-orange-400",
        badge: "bg-orange-500/15 text-orange-300 border border-orange-400/25",
        cta:   "from-orange-500 to-amber-600 shadow-orange-900/30",
        accent:"text-orange-400",
      };
  }
}

export default function CrewStatusCard() {
  const [data, setData]       = useState<CrewStatusResponse>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse]     = useState(false);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/crew-status");
      if (!res.ok) throw new Error(`${res.status}`);
      const next = (await res.json()) as CrewStatusResponse;
      setData(prev => {
        if (prev.status !== next.status) {
          setPulse(true);
          setTimeout(() => setPulse(false), 1000);
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
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  const s = useMemo(() => toneStyles(data.tone), [data.tone]);

  return (
    <div
      className={[
        "relative overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 text-white transition-all duration-500",
        s.ring,
        s.glow,
        pulse ? "scale-[1.015]" : "scale-100",
      ].join(" ")}
    >
      {/* Background radial accents */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(251,146,60,0.10),transparent_35%)]" />

      <div className="relative z-10 space-y-4">

        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.20em] text-slate-500 mb-1.5">
              JC ON THE MOVE · Live Status
            </p>
            <div className="flex items-center gap-2.5">
              <span className={[
                "h-2.5 w-2.5 flex-shrink-0 rounded-full",
                s.dot,
                pulse ? "animate-ping" : "animate-pulse",
              ].join(" ")} />
              <h3 className="text-xl font-extrabold leading-snug text-white">
                {loading ? "Checking Availability…" : data.title}
              </h3>
            </div>
            <p className={`mt-1 text-sm ${loading ? "text-slate-500" : "text-slate-300"}`}>
              {loading ? "Refreshing live crew status…" : data.subtitle}
            </p>
          </div>

          <span className={[
            "shrink-0 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap",
            s.badge,
          ].join(" ")}>
            {data.badge}
          </span>
        </div>

        {/* CTA hint bar */}
        <div className="flex items-center gap-2.5 rounded-2xl bg-white/5 border border-white/8 px-3.5 py-2.5">
          <Sparkles className={`h-4 w-4 shrink-0 ${s.accent}`} />
          <span className="text-sm text-slate-200">{data.ctaHint}</span>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link href="/book">
            <a className={[
              "flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r px-4 py-3 text-sm font-bold text-white shadow-lg transition-transform duration-150 active:scale-[0.97] cursor-pointer",
              s.cta,
            ].join(" ")}>
              <CalendarCheck className="h-4 w-4" />
              Book Now
              <ChevronRight className="h-4 w-4" />
            </a>
          </Link>

          <a
            href="tel:+19062859312"
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.97]"
          >
            <Phone className="h-4 w-4 text-slate-400" />
            (906) 285-9312
          </a>
        </div>

        {/* Refresh note */}
        {!loading && (
          <p className="text-[10px] text-slate-600 text-center">
            Auto-refreshes every 30s · Last updated {new Date(data.refreshedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
        )}
      </div>
    </div>
  );
}
